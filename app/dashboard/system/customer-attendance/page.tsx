import {readCustomerAttendance} from "@/lib/data/erp-memberships";
import {CustomerAttendanceWorkspace} from "@/components/erp/memberships/customer-attendance";
export default async function Page(){return <CustomerAttendanceWorkspace snapshot={await readCustomerAttendance()}/>;}
