// Neon-backed profile reads.
import { one, type Row } from "./core.server";

export async function getProfileByUsername(username: string): Promise<Row | null> {
  return one(`select * from profiles where username = $1`, [username]);
}

export async function getProfileById(id: string): Promise<Row | null> {
  return one(`select * from profiles where id = $1::uuid`, [id]);
}
