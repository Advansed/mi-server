import { findLogin } from "../auth";
import { prisma } from "../db";
import { uniqFromSqlGuid } from "../guid";
import { asNumber } from "../json";

const PLOTS = [
  "Верхневилюйск",
  "Вилюйск",
  "Горный",
  "Жатай",
  "Кобяй",
  "Ленск",
  "Майя",
  "Намцы",
  "Покровск",
  "Хатассы",
  "Чурапча",
  "Якутск",
];

async function divisionOf(token: unknown) {
  if (token == null) return { error: { success: false, message: "Токен не передан или некорректен" } };
  const user = await findLogin(token);
  if (!user) return { error: { success: false, message: "Неверный токен" } };
  return { user };
}

export async function getWorkTypes(params: Record<string, unknown>) {
  const auth = await divisionOf(params.token);
  if (auth.error) return auth.error;
  const division = auth.user.division;
  const rows = await prisma.t_work_types.findMany({
    where: division ? { division: { contains: division } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { success: true, data: rows };
}

export async function getWorks(params: Record<string, unknown>) {
  const auth = await divisionOf(params.token);
  if (auth.error) return auth.error;
  const division = auth.user.division;
  const rows = await prisma.t_works.findMany({
    where: division ? { division: { contains: division } } : {},
    orderBy: { name: "asc" },
  });
  return {
    success: true,
    data: rows.map((row) => ({
      id: uniqFromSqlGuid(row.id),
      name: row.name,
      price: asNumber(row.price),
    })),
  };
}

export function listPlots() {
  return { success: true, data: PLOTS.map((plot) => ({ plot })) };
}
