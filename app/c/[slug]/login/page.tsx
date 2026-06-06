"use client";



import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Suspense, useState } from "react";

import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";

import {

  ThemedAuthPanel,

  ThemedInput,

} from "@/components/cafe/themes/themed-auth-panel";

import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

import { loginCustomerAction } from "@/app/actions/auth";



function LoginForm() {

  const router = useRouter();

  const params = useParams<{ slug: string }>();

  const searchParams = useSearchParams();

  const slug = params.slug;

  const rawNext = searchParams.get("next") || `/c/${slug}`;

  const { settings, experience, path, previewThemeId } = useCafePageContext(slug);



  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);



  function login() {

    if (!email.trim() || !password.trim()) {

      alert("اكتب البريد وكلمة المرور");

      return;

    }

    setLoading(true);

    void loginCustomerAction(slug, email.trim(), password).then((result) => {

      setLoading(false);

      if (!result.ok) {

        alert(result.message);

        return;

      }

      router.push(appendPreviewToNextPath(rawNext, previewThemeId));

    });

  }



  const nextForRegister = appendPreviewToNextPath(rawNext, previewThemeId);



  return (

    <ThemedAuthPanel

      mode="login"

      settings={settings}

      experience={experience}

      registerHref={`${path("register")}?next=${encodeURIComponent(nextForRegister)}`}

      loginHref={path("login")}

      onSubmit={login}

      submitLabel={loading ? "جاري الدخول..." : "دخول ومتابعة"}

    >

      <ThemedInput

        experience={experience}

        value={email}

        onChange={(e) => setEmail(e.target.value)}

        placeholder="البريد الإلكتروني"

        type="email"

      />

      <ThemedInput

        experience={experience}

        value={password}

        onChange={(e) => setPassword(e.target.value)}

        placeholder="كلمة المرور"

        type="password"

      />

    </ThemedAuthPanel>

  );

}



export default function CafeCustomerLoginPage() {

  const params = useParams<{ slug: string }>();

  return (

    <CafeLayout slug={params.slug} className="max-w-lg py-8" maxWidth="max-w-lg">

      <Suspense fallback={<p className="text-center font-black">جاري التحميل...</p>}>

        <LoginForm />

      </Suspense>

    </CafeLayout>

  );

}

