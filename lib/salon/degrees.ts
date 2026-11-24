export const DEGREES_SALON_ID = "59606e0a-ac48-4d3a-b92d-4e53246468be";

export function hasManagedSalonBookings(cafeId: string) {
  return cafeId === DEGREES_SALON_ID || cafeId === "dfa5934b-a097-4fcd-bc5f-2fc8b974e545";
}
