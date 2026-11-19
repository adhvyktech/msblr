import { prisma } from './prisma';

/** getSetting<T>('theme', 'c') — Setting rows are key -> JSON. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return (s ? (s.value as T) : fallback);
}
export async function setSetting(key: string, value: unknown) {
  const v = value as never;
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}
