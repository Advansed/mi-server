import { randomUUID } from "node:crypto";
import { findLogin } from "../auth";
import { prisma } from "../db";

export async function login(params: Record<string, unknown>) {
  const name = typeof params.login === "string" ? params.login : null;
  const password = typeof params.password === "string" ? params.password : null;
  if (!name || !password) {
    return { success: false, message: "Не заполнен логин или пароль" };
  }

  const user = await prisma.t_logins.findFirst({ where: { name } });
  if (!user) return { success: false, message: "Пользователь не найден" };
  if ((user.password ?? "") !== password) return { success: false, message: "Пароль не верный" };

  const token = randomUUID();
  const updated = await prisma.t_logins.update({
    where: { id: user.id },
    data: { token },
  });

  return {
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      image: updated.image,
      token: updated.token,
    },
  };
}

export async function openSession(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const row = await prisma.t_session.create({
    data: { userId: user.id, openDate: new Date() },
  });
  return {
    success: true,
    data: { id: row.id, user_id: row.userId, open_date: row.openDate, close_date: row.closeDate },
  };
}

export async function closeSession(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };
  if (params.id == null) return { success: false, message: "Не указана сессия" };

  const row = await prisma.t_session.findFirst({
    where: { id: String(params.id), userId: user.id },
  });
  if (!row) return { success: false, message: "Сессия не найдена" };
  if (row.closeDate) return { success: false, message: "Смена уже закрыта" };

  const updated = await prisma.t_session.update({
    where: { id: row.id },
    data: { closeDate: new Date() },
  });
  return {
    success: true,
    data: {
      id: updated.id,
      user_id: updated.userId,
      open_date: updated.openDate,
      close_date: updated.closeDate,
    },
  };
}

export async function getSession(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Не верный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const row = await prisma.t_session.findFirst({
    where: { userId: user.id, closeDate: null },
    orderBy: { openDate: "desc" },
  });
  if (!row) return { success: true, data: null };
  return {
    success: true,
    data: { id: row.id, user_id: row.userId, open_date: row.openDate, close_date: row.closeDate },
  };
}
