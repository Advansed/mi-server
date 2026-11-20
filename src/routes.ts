import { findLogin } from "./auth";
import { exActs, exInvoices, insAgreements, insEquipments, insInvoices, insLogins, insOrders, insTarifes, insWorks, insWorkTypes } from "./exchange/batch";
import { renderPdf } from "./pdf";
import { getAct, getActs, setAct } from "./services/acts";
import { getWorks, getWorkTypes, listPlots } from "./services/catalog";
import { addLic, delLic, getLic, getLics } from "./services/lics";
import { listInvoices, listMpInvoices, setInvAddress, setInvLic, setInvWorker, setInvoice, setMpInv } from "./services/orders";
import { checkSbpStatus, createSbpPayment } from "./services/sbp";
import { closeSession, getSession, login, openSession } from "./services/session";
import { listWorkers, setLocation } from "./services/workers";
import { findLics } from "./sql/vesta";
import { publishInvoices, publishWorkers } from "./socket";

export type Reply = { status: number; body: unknown; text?: string };

function json(body: unknown, status = 200): Reply {
  return { status, body };
}

function exchangeKeyOk(header: string | undefined, params: Record<string, unknown>) {
  const expected = process.env.EXCHANGE_KEY ?? "";
  if (!expected) return false;
  const fromBody = typeof params.key === "string" ? params.key : typeof params.exchange_key === "string" ? params.exchange_key : "";
  return header === expected || fromBody === expected;
}

export async function dispatch(
  path: string,
  params: Record<string, unknown>,
  exchangeHeader: string | undefined,
): Promise<Reply> {
  const route = path.toLowerCase();

  if (route === "/") return { status: 200, body: null, text: "Server is running with connection pool" };
  if (route === "/get_version") return json({ success: true, data: { server: "mi-server", version: "1.0.1" } });
  if (route === "/mp_get_pdf") {
    const pdf = await renderPdf(params.template);
    return { status: pdf.status, body: pdf.body };
  }

  if (route === "/upd_method") {
    return json({ success: false, message: "Метод отключён" });
  }

  if (route.startsWith("/upd_") || route.startsWith("/ex_")) {
    if (!exchangeKeyOk(exchangeHeader, params)) {
      if (!route.startsWith("/upd_")) console.log(`[auth] exchange rejected ${route}`);
      return json({ error: true, message: "Неверный ключ обмена" }, 401);
    }
    if (!route.startsWith("/upd_")) console.log(`[auth] exchange ok ${route}`);
    const body = await dispatchExchange(route, params);
    if (route === "/upd_orders" && body && typeof body === "object" && (body as { error?: boolean }).error !== true) {
      void publishInvoices();
    }
    return json(body);
  }

  const body = await dispatchApp(route, params);
  if (route === "/mp_set_location" && body && typeof body === "object" && (body as { success?: boolean }).success !== false) {
    void publishWorkers();
  }
  return json(body);
}

async function dispatchExchange(route: string, params: Record<string, unknown>) {
  switch (route) {
    case "/upd_orders":
      return insOrders(params);
    case "/upd_invoices":
      return insInvoices(params);
    case "/upd_tarifes":
      return insTarifes(params);
    case "/upd_equipments":
      return insEquipments(params);
    case "/upd_agreements":
      return insAgreements(params);
    case "/upd_works":
      return insWorks(params);
    case "/upd_work_types":
      return insWorkTypes(params);
    case "/upd_logins":
      return insLogins(params);
    case "/ex_acts":
      return exActs(params);
    case "/ex_invoices":
      return exInvoices(params);
    default:
      return { success: false, message: `no such method (${route})` };
  }
}

async function dispatchApp(route: string, params: Record<string, unknown>) {
  switch (route) {
    case "/login":
      return login(params);
    case "/invoices":
      if (params.token == null) return { success: false, message: "Не верный токен" };
      return listInvoices(String(params.token));
    case "/set_invoice":
      return setInvoice(params);
    case "/workers":
      if (params.token == null) return { success: false, message: "Неверный токен" };
      return listWorkers(String(params.token));
    case "/get_session":
      return getSession(params);
    case "/open_session":
      return openSession(params);
    case "/close_session":
      return closeSession(params);
    case "/set_inv_address":
      return setInvAddress(params);
    case "/set_inv_worker":
      return setInvWorker(params);
    case "/set_inv_lic":
      return setInvLic(params);
    case "/add_lic":
      return addLic(params);
    case "/del_lic":
      return delLic(params);
    case "/get_lics":
      return getLics(params);
    case "/get_lic":
      return getLic(params);
    case "/get_works":
      return getWorks(params);
    case "/get_work_types":
      return getWorkTypes(params);
    case "/mp_invoices":
      return listMpInvoices(params);
    case "/mp_set_inv":
      return setMpInv(params);
    case "/mp_get_act":
      return getAct(params);
    case "/mp_set_act":
      return setAct(params);
    case "/mp_plots":
      return listPlots();
    case "/mp_find_lics": {
      const user = await findLogin(params.token);
      if (!user) return { success: false, message: "Неверный токен" };
      return findLics(params);
    }
    case "/mp_set_location":
      return setLocation(params);
    case "/mp_sbp":
      return createSbpPayment(params);
    case "/mp_sbp_status":
      return checkSbpStatus(params);
    case "/mp_get_acts":
      return getActs(params);
    default:
      return { success: false, message: `no such method (${route})` };
  }
}
