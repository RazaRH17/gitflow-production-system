// app/api/lock/route.ts
// PATCH — acquire or release a row lock on a GitFile record.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const { fileId, actor, action } = await req.json();
    // action: "acquire" | "release"

    if (!fileId || !actor || !action) {
      return NextResponse.json({ error: "fileId, actor, and action are required." }, { status: 400 });
    }

    const file = await prisma.gitFile.findUnique({ where: { id: fileId } });
    if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

    if (action === "acquire") {
      if (file.locked_by && file.locked_by !== actor) {
        return NextResponse.json({ error: `File is locked by ${file.locked_by}.`, locked_by: file.locked_by }, { status: 409 });
      }
      const updated = await prisma.gitFile.update({ where: { id: fileId }, data: { locked_by: actor } });
      return NextResponse.json({ file: updated, message: `Lock acquired by ${actor}.` });
    }

    if (action === "release") {
      if (file.locked_by !== actor) {
        return NextResponse.json({ error: `Cannot release lock held by ${file.locked_by}.` }, { status: 403 });
      }
      const updated = await prisma.gitFile.update({ where: { id: fileId }, data: { locked_by: null } });
      return NextResponse.json({ file: updated, message: `Lock released by ${actor}.` });
    }

    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
