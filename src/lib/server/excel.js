import * as XLSX from "xlsx";

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP = {
  firstname: "firstName",
  lastname: "lastName",
  fullname: "fullName",
  leadname: "fullName",
  phone: "phone",
  mobilenumber: "phone",
  mobile: "phone",
  leadsmsmobile: "phone",
  email: "email",
  leademail: "email",
  city: "city",
  cluster: "city",
  state: "state",
  source: "source",
  loantype: "loanType",
  product: "loanType",
  loanamount: "loanAmount",
  leadsanctionamount: "loanAmount",
  leaddisbursedamt: "loanAmount",
  amount: "loanAmount",
  monthlyincome: "monthlyIncome",
  income: "monthlyIncome",
  notes: "notes",
};

function normalizePhone(value) {
  if (value === null || value === undefined) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  const hasPlusPrefix = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  return hasPlusPrefix ? `+${digits}` : digits;
}

export function parseCustomerExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rows.map((row) => {
    const parsed = {};

    Object.entries(row).forEach(([key, value]) => {
      const normalized = normalizeHeader(key);
      const mapped = HEADER_MAP[normalized];

      if (mapped) {
        parsed[mapped] = typeof value === "string" ? value.trim() : value;
      }
    });

    if (!parsed.firstName && parsed.fullName) {
      const [first, ...rest] = String(parsed.fullName).split(" ");
      parsed.firstName = first;
      parsed.lastName = rest.join(" ");
    }

    return {
      firstName: parsed.firstName || "",
      lastName: parsed.lastName || null,
      phone: normalizePhone(parsed.phone),
      email: parsed.email || null,
      city: parsed.city || null,
      state: parsed.state || null,
      source: parsed.source || "Excel Upload",
      loanType: parsed.loanType || null,
      loanAmount: parsed.loanAmount ? Number(parsed.loanAmount) : null,
      monthlyIncome: parsed.monthlyIncome ? Number(parsed.monthlyIncome) : null,
      notes: parsed.notes || null,
    };
  });
}