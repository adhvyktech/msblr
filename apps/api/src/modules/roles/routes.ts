import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PERMS } from '@msblr/shared';
import { prisma, type Tx } from '../../lib/prisma';
import { requirePerm } from '../../lib/auth';
import { parse } from '../../lib/parse';
import { httpError } from '../../lib/errors';
import { audit } from '../../lib/audit';

const normMobile = (m: string) => {
  const d = m.replace(/\D/g, '');
  return d.length > 10 && d.startsWith('91') ? d.slice(2) : d;
};
const mobileSchema = z.string().transform(normMobile).refine((m) => /^[6-9]\d{9}$/.test(m), 'Enter a valid 10-digit mobile number');

const permsSchema = z.object({ perms: z.array(z.enum(PERMS as unknown as [string, ...string[]])).max(PERMS.length) });
const assignSchema = z
  .object({ userId: z.number().int().positive().optional(), mobile: mobileSchema.optional(), roleName: z.string().min(1), zoneId: z.number().int().positive().nullish() })
  .refine((v) => v.userId || v.mobile, { message: 'Choose a user or enter a mobile number', path: ['userId'] });
const handoverSchema = z
  .object({
    fromUserId: z.number().int().positive(),
    toUserId: z.number().int().positive().optional(),
    toMobile: mobileSchema.optional(),
    roleIds: z.array(z.number().int().positive()).min(1, 'Choose at least one role'),
  })
  .refine((v) => v.toUserId || v.toMobile, { message: 'Choose the new office bearer', path: ['toUserId'] });

async function resolveUser(o: { userId?: number; mobile?: string }, tx: Tx | typeof prisma = prisma) {
  const u = await tx.user.findFirst({ where: o.userId ? { id: o.userId } : { mobile: o.mobile! }, include: { person: { select: { name: true } } } });
  if (!u) throw httpError(404, 'USER_NOT_FOUND', 'No registered user with this mobile number. They must be a member or have logged in before.');
  if (u.status !== 'ACTIVE') throw httpError(409, 'USER_DISABLED', 'This user account is disabled.');
  return u;
}
const userLabel = (u: { displayName: string | null; mobile: string; person: { name: string } | null }) => u.displayName ?? u.person?.name ?? u.mobile;

async function superAdminHolders(tx: Tx | typeof prisma = prisma) {
  const rows = await tx.userRole.findMany({ where: { role: { name: 'super_admin' }, user: { status: 'ACTIVE' } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

const routes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requirePerm('roles.manage'));

  app.get('/roles', async () => {
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' }, include: { permissions: true, _count: { select: { users: true } } } });
    return {
      data: roles.map((r) => ({ id: r.id, name: r.name, label: r.label, isStaff: r.isStaff, userCount: r._count.users, permissions: r.permissions.map((p) => p.perm).sort() })),
      allPermissions: PERMS,
    };
  });

  app.put('/roles/:id/permissions', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const { perms } = parse(permsSchema, req.body);
    const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw httpError(404, 'NOT_FOUND', 'Role not found');
    if (!role.isStaff) throw httpError(400, 'NOT_STAFF_ROLE', 'Permissions can only be changed for staff roles.');
    const next = [...new Set(perms)];
    if (role.name === 'super_admin' && !next.includes('roles.manage')) {
      throw httpError(409, 'PROTECTED', 'The super admin role must always keep the "roles.manage" permission.');
    }
    const before = role.permissions.map((p) => p.perm).sort();
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (next.length) await tx.rolePermission.createMany({ data: next.map((perm) => ({ roleId: id, perm })) });
      await audit(req, { action: 'role.permissions_update', entity: 'role', entityId: id, summary: `Changed permissions of ${role.label}`, before: { perms: before }, after: { perms: [...next].sort() } }, tx);
    });
    return { data: { id, permissions: [...next].sort() } };
  });

  app.get('/staff', async () => {
    const users = await prisma.user.findMany({
      where: { roles: { some: { role: { isStaff: true } } } },
      orderBy: { id: 'asc' },
      include: { person: { select: { name: true, family: { select: { membershipNo: true } } } }, roles: { where: { role: { isStaff: true } }, include: { role: true, zone: true } } },
    });
    return {
      data: users.map((u) => ({
        userId: u.id,
        name: userLabel(u),
        mobile: u.mobile,
        membershipNo: u.person?.family.membershipNo ?? null,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        roles: u.roles.map((r) => ({ userRoleId: r.id, roleId: r.roleId, name: r.role.name, label: r.role.label, zoneId: r.zoneId, zoneName: r.zone?.name ?? null })),
      })),
    };
  });

  app.post('/assign', async (req, reply) => {
    const b = parse(assignSchema, req.body);
    const role = await prisma.role.findUnique({ where: { name: b.roleName } });
    if (!role || !role.isStaff) throw httpError(400, 'INVALID_ROLE', 'Choose a staff role.');
    const user = await resolveUser(b);
    const zoneId = b.zoneId ?? null;
    if (zoneId !== null && !(await prisma.zone.findUnique({ where: { id: zoneId } }))) throw httpError(400, 'INVALID_ZONE', 'Zone not found.');
    const dup = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id, zoneId } });
    if (dup) throw httpError(409, 'ALREADY_ASSIGNED', 'This user already has this role.');
    const created = await prisma.$transaction(async (tx) => {
      const ur = await tx.userRole.create({ data: { userId: user.id, roleId: role.id, zoneId } });
      await audit(req, { action: 'role.assign', entity: 'user', entityId: user.id, summary: `Gave ${role.label} to ${userLabel(user)}`, after: { role: role.name, zoneId } }, tx);
      return ur;
    });
    reply.status(201);
    return { data: { userRoleId: created.id, userId: user.id } };
  });

  app.delete('/assign/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    const ur = await prisma.userRole.findUnique({ where: { id }, include: { role: true, user: { include: { person: { select: { name: true } } } } } });
    if (!ur) throw httpError(404, 'NOT_FOUND', 'Role assignment not found');
    if (ur.role.name === 'super_admin') {
      const holders = await superAdminHolders();
      if (holders.has(ur.userId) && holders.size <= 1) throw httpError(409, 'LAST_SUPER_ADMIN', 'You cannot remove the last super admin. Assign another super admin first.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.userRole.delete({ where: { id } });
      await audit(req, { action: 'role.remove', entity: 'user', entityId: ur.userId, summary: `Removed ${ur.role.label} from ${userLabel(ur.user)}`, before: { role: ur.role.name, zoneId: ur.zoneId } }, tx);
    });
    return { data: { ok: true } };
  });

  app.post('/handover', async (req) => {
    const b = parse(handoverSchema, req.body);
    const from = await prisma.user.findUnique({ where: { id: b.fromUserId }, include: { person: { select: { name: true } } } });
    if (!from) throw httpError(404, 'USER_NOT_FOUND', 'The outgoing user was not found.');
    const to = await resolveUser({ userId: b.toUserId, mobile: b.toMobile });
    if (to.id === from.id) throw httpError(400, 'SAME_USER', 'Choose a different person to hand over to.');

    const result = await prisma.$transaction(async (tx) => {
      const held = await tx.userRole.findMany({ where: { userId: from.id, roleId: { in: b.roleIds }, role: { isStaff: true } }, include: { role: true } });
      const heldRoleIds = new Set(held.map((h) => h.roleId));
      const missing = b.roleIds.filter((r) => !heldRoleIds.has(r));
      if (missing.length) throw httpError(400, 'ROLE_NOT_HELD', 'The outgoing user does not hold one of the chosen roles.');
      let moved = 0;
      for (const h of held) {
        await tx.userRole.deleteMany({ where: { id: h.id } });
        const exists = await tx.userRole.findFirst({ where: { userId: to.id, roleId: h.roleId, zoneId: h.zoneId } });
        if (!exists) await tx.userRole.create({ data: { userId: to.id, roleId: h.roleId, zoneId: h.zoneId } });
        moved++;
      }
      const remaining = await tx.userRole.count({ where: { userId: from.id, role: { isStaff: true } } });
      let revoked = 0;
      if (remaining === 0) {
        const r = await tx.session.updateMany({ where: { userId: from.id, revokedAt: null }, data: { revokedAt: new Date() } });
        revoked = r.count;
      }
      const roleLabels = [...new Set(held.map((h) => h.role.label))];
      await audit(
        req,
        {
          action: 'role.handover', entity: 'user', entityId: from.id,
          summary: `Committee handover: ${roleLabels.join(', ')} from ${userLabel(from)} to ${userLabel(to)}`,
          before: { userId: from.id, roles: held.map((h) => ({ role: h.role.name, zoneId: h.zoneId })) },
          after: { userId: to.id, sessionsRevoked: revoked },
        },
        tx,
      );
      return { moved, sessionsRevoked: revoked, fromHasNoStaffRoles: remaining === 0 };
    });
    return { data: { fromUserId: from.id, toUserId: to.id, ...result } };
  });

  app.get('/users/search', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim();
    if (q.length < 2) return { data: [] };
    const digits = q.replace(/\D/g, '');
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          ...(digits ? [{ mobile: { contains: digits } }] : []),
          { displayName: { contains: q, mode: 'insensitive' } },
          { person: { name: { contains: q, mode: 'insensitive' } } },
          { person: { family: { membershipNo: { contains: q, mode: 'insensitive' } } } },
        ],
      },
      take: 20,
      orderBy: { id: 'asc' },
      include: { person: { select: { name: true, family: { select: { membershipNo: true } } } } },
    });
    return { data: users.map((u) => ({ id: u.id, name: userLabel(u), mobile: u.mobile, membershipNo: u.person?.family.membershipNo ?? null })) };
  });
};
export default routes;
