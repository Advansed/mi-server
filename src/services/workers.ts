import { findLogin } from "../auth";
import { prisma } from "../db";
import { isGuid } from "../guid";
import { asNumber } from "../json";

export async function listWorkers(token: string) {
  if (!isGuid(token)) return { success: false, message: "Неверный токен" };
  const user = await findLogin(token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const people = await prisma.t_logins.findMany({
    where: user.division ? { division: { contains: user.division } } : {},
    orderBy: { name: "asc" },
  });
  const ids = people.map((person) => person.id);
  if (ids.length === 0) return { success: true, data: [] };

  const [locations, openOrders, closedOrders] = await Promise.all([
    prisma.t_locations.findMany({
      where: { userId: { in: ids } },
      orderBy: { id: "desc" },
      select: { userId: true, lat: true, lon: true, updatedAt: true },
    }),
    prisma.t_orders.groupBy({
      by: ["executor"],
      where: { executor: { in: ids }, completeDate: null },
      _count: { _all: true },
    }),
    prisma.t_orders.groupBy({
      by: ["executor"],
      where: { executor: { in: ids }, completeDate: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const latest = new Map<string, (typeof locations)[number]>();
  for (const location of locations) {
    if (!latest.has(location.userId)) latest.set(location.userId, location);
  }
  const open = new Map(openOrders.map((row) => [row.executor, row._count._all]));
  const closed = new Map(closedOrders.map((row) => [row.executor, row._count._all]));

  return {
    success: true,
    data: people.map((person) => {
      const location = latest.get(person.id);
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        image: person.image,
        lat: location ? asNumber(location.lat) : null,
        lon: location ? asNumber(location.lon) : null,
        location_updated_at: location?.updatedAt ?? null,
        in_work: open.get(person.id) ?? 0,
        completed: closed.get(person.id) ?? 0,
      };
    }),
  };
}

export async function setLocation(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Неверный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Токен не найден или невалиден" };

  const lat = asNumber(params.lat);
  const lon = asNumber(params.lon);
  if (lat == null || lon == null) {
    return { success: false, message: "Координаты отсутствуют или невалидны" };
  }

  const battery = asNumber(params.battery_level);
  await prisma.t_locations.create({
    data: {
      userId: user.id,
      lat,
      lon,
      speed: asNumber(params.speed),
      heading: asNumber(params.heading),
      batteryLevel: battery == null ? null : Math.max(0, Math.min(255, Math.trunc(battery))),
    },
  });
  return { success: true, message: "Координаты успешно добавлены" };
}
