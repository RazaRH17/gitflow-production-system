// app/api/files/route.ts
// GET  — fetch all files from Neon DB
// POST — seed default files if table is empty

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SEED_FILES = [
  { name: "auth.js",       content: "// Auth module\nfunction login(user, pass) {\n  return db.verify(user, pass);\n}",                                                current_branch: "dev"     as const },
  { name: "api.config.js", content: "// API Config\nconst BASE_URL = 'https://api.example.com';\nconst TIMEOUT = 5000;",                                             current_branch: "dev"     as const },
  { name: "schema.sql",    content: "-- Database Schema\nCREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255)\n);",                                   current_branch: "staging" as const },
  { name: "deploy.yml",    content: "# Deployment Pipeline\nstages:\n  - build\n  - test\n  - deploy",                                                               current_branch: "main"    as const },
  { name: "utils.js",      content: "// Utility Functions\nconst formatDate = (d) => d.toISOString();\nconst slugify = (s) => s.toLowerCase().replace(/ /g, '-');",   current_branch: "dev"     as const },
];

export async function GET() {
  try {
    const files = await prisma.gitFile.findMany({ orderBy: { id: "asc" } });

    // Auto-seed on first run
    if (files.length === 0) {
      await prisma.gitFile.createMany({ data: SEED_FILES });
      const seeded = await prisma.gitFile.findMany({ orderBy: { id: "asc" } });
      return NextResponse.json({ files: seeded, seeded: true });
    }

    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, content, current_branch = "dev" } = body;
    if (!name || !content) return NextResponse.json({ error: "name and content required" }, { status: 400 });

    const file = await prisma.gitFile.create({ data: { name, content, current_branch } });
    return NextResponse.json({ file }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
