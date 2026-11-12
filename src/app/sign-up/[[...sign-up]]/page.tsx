import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="flex justify-center pt-6">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
