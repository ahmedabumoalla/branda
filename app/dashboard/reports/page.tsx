import { ReportsPageClient } from "@/components/dashboard/pages/reports-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerCustomersDashboard } from "@/lib/data/customers";

import { getOwnerOrders } from "@/lib/data/orders";

import { getOwnerReservations } from "@/lib/data/reservations";

import { getOwnerReviews } from "@/lib/data/reviews";



export default async function ReportsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <ReportsPageClient

        initialOrders={[]}

        initialCustomers={[]}

        initialReviews={[]}

        initialReservations={[]}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [orders, dashboard, reviews, reservations] = await Promise.all([

      getOwnerOrders(),

      getOwnerCustomersDashboard(),

      getOwnerReviews(),

      getOwnerReservations(),

    ]);



    return (

      <ReportsPageClient

        initialOrders={orders}

        initialCustomers={dashboard.customers}

        initialReviews={reviews}

        initialReservations={reservations}

      />

    );

  } catch {

    return (

      <ReportsPageClient

        initialOrders={[]}

        initialCustomers={[]}

        initialReviews={[]}

        initialReservations={[]}

        configError="تعذر تحميل التقارير"

      />

    );

  }

}

