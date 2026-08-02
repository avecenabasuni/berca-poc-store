"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { confirmEmailVerification } from "@lib/data/customer"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type VerificationState = "verifying" | "success" | "error"

const VerifyAccount = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [state, setState] = useState<VerificationState>("verifying")
  // Guard against the effect running twice in React Strict Mode, which would
  // consume the single-use token before the customer sees the result.
  const confirmed = useRef(false)

  useEffect(() => {
    if (confirmed.current) {
      return
    }
    confirmed.current = true

    if (!token) {
      setState("error")
      return
    }

    confirmEmailVerification(token).then(({ success }) =>
      setState(success ? "success" : "error")
    )
  }, [token])

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center text-center gap-y-4"
      data-testid="verify-account-page"
    >
      <h1 className="text-large-semi uppercase">Email verification</h1>

      {state === "verifying" && (
        <p className="text-base-regular text-ui-fg-base" role="status">
          Verifying your email...
        </p>
      )}

      {state === "success" && (
        <>
          <p className="text-base-regular text-ui-fg-base">
            Your email is verified. You can now sign in to your account.
          </p>
          <LocalizedClientLink
            href="/account"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#E53946] px-4 font-medium text-white hover:bg-[#9F2335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Go to sign in
          </LocalizedClientLink>
        </>
      )}

      {state === "error" && (
        <>
          <p className="text-base-regular text-ui-fg-base">
            This verification link is invalid or has expired. Sign in to receive
            a new verification email.
          </p>
          <LocalizedClientLink
            href="/account"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#1E1F74] px-4 font-medium text-white hover:bg-[#3A1E65] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Go to sign in
          </LocalizedClientLink>
        </>
      )}
    </div>
  )
}

export default VerifyAccount
