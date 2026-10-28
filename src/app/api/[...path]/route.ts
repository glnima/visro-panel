import "@/server/db-node";
import { handle } from "@/server/api";

const run = (req: Request) => handle(req);

export const GET = run;
export const POST = run;
export const PATCH = run;
export const DELETE = run;
