// app/api/git-push/route.ts
// Serverless POST handler — checks DB row locks, updates Neon via Prisma,
// then pushes file content to GitHub via Octokit.

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Octokit } from "@octokit/rest";
import type { GitPushRequestBody, GitPushResponse, StepResult } from "@/lib/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getPrismaClient(connectionString?: string): PrismaClient {
  // Use the dynamically supplied connection string if provided (from the UI
  // config panel), otherwise fall back to the environment variable.
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No PostgreSQL connection string available.");
  return new PrismaClient({ datasources: { db: { url } } });
}

function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<GitPushResponse>> {
  const steps: StepResult[] = [];
  let prisma: PrismaClient | null = null;

  try {
    // ── Parse body & headers ─────────────────────────────────────────────────
    const body: GitPushRequestBody = await req.json();
    const { fileId, fileName, content, actor, branch, githubRepo } = body;

    // Credentials can come from request headers (set by the UI config panel)
    // or fall back to server-side environment variables.
    const neonConnString =
      req.headers.get("x-neon-connection-string") ?? undefined;
    const githubPat =
      req.headers.get("x-github-pat") ?? process.env.GITHUB_PAT;

    if (!fileId || !fileName || content === undefined || !actor || !branch) {
      return NextResponse.json(
        { success: false, message: "Missing required fields.", steps, error: "INVALID_BODY" },
        { status: 400 }
      );
    }

    // ── Step 1: Check PostgreSQL row lock ─────────────────────────────────────
    const t1 = timer();
    prisma = getPrismaClient(neonConnString);

    const existingFile = await prisma.gitFile.findUnique({ where: { id: fileId } });

    if (!existingFile) {
      steps.push({ step: 1, label: "Check PostgreSQL row lock", status: "error", detail: `File ID ${fileId} not found.`, durationMs: t1() });
      return NextResponse.json({ success: false, message: "File not found in database.", steps, error: "NOT_FOUND" }, { status: 404 });
    }

    if (existingFile.locked_by && existingFile.locked_by !== actor) {
      steps.push({ step: 1, label: "Check PostgreSQL row lock", status: "error", detail: `Row is locked by ${existingFile.locked_by}.`, durationMs: t1() });
      return NextResponse.json(
        { success: false, message: `File is locked by ${existingFile.locked_by}. Cannot overwrite.`, steps, error: "ROW_LOCKED" },
        { status: 409 }
      );
    }

    steps.push({ step: 1, label: "Check PostgreSQL row lock", status: "ok", detail: `Row unlocked or owned by ${actor}.`, durationMs: t1() });

    // ── Step 2: Prisma update → Neon DB ──────────────────────────────────────
    const t2 = timer();

    const updatedFile = await prisma.gitFile.update({
      where: { id: fileId },
      data: {
        content,
        current_branch: branch,
        locked_by: actor,
        updated_at: new Date(),
      },
    });

    steps.push({ step: 2, label: "Prisma update → Neon DB", status: "ok", detail: `Wrote ${content.length} chars to git_files.id=${fileId}.`, durationMs: t2() });

    // ── Step 3: Encode content to base64 blob ─────────────────────────────────
    const t3 = timer();
    const base64Content = toBase64(content);
    steps.push({ step: 3, label: "Compile content to base64 blob", status: "ok", detail: `Encoded ${base64Content.length} base64 chars.`, durationMs: t3() });

    // ── Step 4: Push to GitHub via Octokit ───────────────────────────────────
    const t4 = timer();
    let githubSha: string | null = null;

    if (!githubPat || !githubRepo) {
      // GitHub credentials not supplied — skip GitHub push, log as warning.
      steps.push({ step: 4, label: "GitHub Octokit push", status: "error", detail: "No GitHub PAT or repo provided. Skipped.", durationMs: t4() });
    } else {
      const [owner, repo] = githubRepo.split("/");

      if (!owner || !repo) {
        steps.push({ step: 4, label: "GitHub Octokit push", status: "error", detail: `Invalid repo format "${githubRepo}". Expected "owner/repo".`, durationMs: t4() });
      } else {
        const octokit = new Octokit({ auth: githubPat });
        const filePath = `src/${fileName}`;
        const commitMessage = `chore(${actor.toLowerCase().replace(" ", "-")}): update ${fileName} via GitFlow CMS`;

        // Fetch current file SHA (required by GitHub API for updates).
        let currentSha: string | undefined = existingFile.sha ?? undefined;

        if (!currentSha) {
          try {
            const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });
            if (!Array.isArray(data) && "sha" in data) currentSha = data.sha;
          } catch {
            // File doesn't exist yet in GitHub — will be created fresh.
            currentSha = undefined;
          }
        }

        const { data: commitData } = await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: commitMessage,
          content: base64Content,
          branch,
          ...(currentSha ? { sha: currentSha } : {}),
        });

        githubSha = commitData.content?.sha ?? null;

        // Persist the new SHA back to DB so future updates work correctly.
        await prisma.gitFile.update({ where: { id: fileId }, data: { sha: githubSha } });

        steps.push({
          step: 4,
          label: "GitHub Octokit: repos.createOrUpdateFileContents()",
          status: "ok",
          detail: `Pushed to ${owner}/${repo}@${branch} · commit SHA: ${commitData.commit.sha?.slice(0, 7)}.`,
          durationMs: t4(),
        });
      }
    }

    // ── Step 5: Done ─────────────────────────────────────────────────────────
    steps.push({ step: 5, label: "Status 200 OK — Pushed to Dev Branch successfully!", status: "ok", detail: `File "${fileName}" is live in ${branch}.`, durationMs: 0 });

    return NextResponse.json({
      success: true,
      message: `"${fileName}" pushed to ${branch} branch successfully.`,
      steps,
      payload: { prismaUpdated: true, githubSha, branch },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    steps.push({ step: steps.length + 1, label: "Unhandled exception", status: "error", detail: message, durationMs: 0 });

    return NextResponse.json(
      { success: false, message, steps, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
