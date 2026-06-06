"use server";

import { getOwnerOrders, updateOrderStatus, createPickupOrder } from "@/lib/data/orders";
import type { OrderStatus } from "@/lib/mock/orders";
import {
  acceptPickupOrder,
  createCafeOrderFromProduct,
  rejectPickupOrder,
  type CreateOrderInput,
} from "@/lib/platform/order-flow";

export async function fetchOwnerOrdersAction() {
  return getOwnerOrders();
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  rejectionReason?: string
) {
  await updateOrderStatus(orderId, status, rejectionReason);
}

export async function createCafeOrderAction(input: CreateOrderInput) {
  return createCafeOrderFromProduct(input);
}

export async function acceptPickupOrderAction(orderId: string, cafeSlug?: string) {
  return acceptPickupOrder(orderId, cafeSlug);
}

export async function rejectPickupOrderAction(
  orderId: string,
  reason: string,
  cafeSlug?: string
) {
  return rejectPickupOrder(orderId, reason, cafeSlug);
}

export async function createPickupOrderAction(
  input: Parameters<typeof createPickupOrder>[0]
) {
  return createPickupOrder(input);
}
