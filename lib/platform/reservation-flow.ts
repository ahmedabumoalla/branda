import type { BrandaCustomerSession } from "@/lib/customer/session";
import { TRANSACTIONS_KEY, type CustomerTransaction } from "@/lib/mock/customer-activity";
import type { CafeBranch } from "@/lib/mock/branches";
import type { CafeReservation } from "@/lib/mock/reservations";
import {
  PLATFORM_CUSTOMERS_KEY,
  PLATFORM_OPERATIONS_KEY,
  mockPlatformCustomers,
  mockPlatformOperations,
  type PlatformCustomer,
  type PlatformOperation,
} from "@/lib/platform/admin-data";

const CAFE_ID = "cafe_qatrah";
const CAFE_NAME = "كوفي قطرة";

export type CreateReservationInput = {
  slug: string;
  customer: BrandaCustomerSession;
  branch: CafeBranch;
  reservationType: CafeReservation["type"];
  guests: number;
  date: string;
  time: string;
  notes?: string;
};

export function createReservationFlow(input: CreateReservationInput) {
  const { slug, customer, branch, reservationType, guests, date, time, notes } =
    input;

  const createdAt = new Date().toISOString().slice(0, 10);
  const branchNote = `الفرع: ${branch.name}`;

  const newReservation: CafeReservation = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    customerName: customer.fullName,
    phone: customer.phone,
    type: reservationType,
    guests,
    date,
    time,
    notes: notes?.trim() ? `${notes.trim()} • ${branchNote}` : branchNote,
    status: "بانتظار الرد",
    createdAt,
  };

  const newTransaction: CustomerTransaction = {
    id: crypto.randomUUID(),
    cafeSlug: slug,
    customerId: customer.id,
    type: "حجز",
    title: `حجز ${reservationType}`,
    description: `حجز في ${branch.name} لعدد ${guests} أشخاص بتاريخ ${date} الساعة ${time}`,
    createdAt,
  };

  const operation: PlatformOperation = {
    id: crypto.randomUUID(),
    cafeId: CAFE_ID,
    cafeName: CAFE_NAME,
    customerName: customer.fullName,
    type: "حجز",
    title: `طلب حجز ${reservationType} — ${branch.name}`,
    status: "بانتظار الرد",
    createdAt,
  };

  const savedReservations = localStorage.getItem("branda_qatrah_reservations");
  const reservations: CafeReservation[] = savedReservations
    ? JSON.parse(savedReservations)
    : [];
  localStorage.setItem(
    "branda_qatrah_reservations",
    JSON.stringify([newReservation, ...reservations])
  );

  const savedTx = localStorage.getItem(TRANSACTIONS_KEY);
  const transactions: CustomerTransaction[] = savedTx ? JSON.parse(savedTx) : [];
  localStorage.setItem(
    TRANSACTIONS_KEY,
    JSON.stringify([newTransaction, ...transactions])
  );

  const savedOps = localStorage.getItem(PLATFORM_OPERATIONS_KEY);
  const operations: PlatformOperation[] = savedOps
    ? JSON.parse(savedOps)
    : mockPlatformOperations;
  localStorage.setItem(
    PLATFORM_OPERATIONS_KEY,
    JSON.stringify([operation, ...operations])
  );

  const savedCustomers = localStorage.getItem(PLATFORM_CUSTOMERS_KEY);
  const customers: PlatformCustomer[] = savedCustomers
    ? JSON.parse(savedCustomers)
    : mockPlatformCustomers;

  if (!customers.some((c) => c.id === customer.id)) {
    const linked: PlatformCustomer = {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      cafeId: CAFE_ID,
      cafeName: CAFE_NAME,
      status: "نشط",
      totalSpent: 0,
      loyaltyPoints: 0,
      createdAt,
    };
    localStorage.setItem(
      PLATFORM_CUSTOMERS_KEY,
      JSON.stringify([linked, ...customers])
    );
  }

  return newReservation;
}
