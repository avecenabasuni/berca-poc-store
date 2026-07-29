"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"
import PaymentButton from "../payment-button"
import { useSearchParams, useParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getDictionary } from "@lib/i18n"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).checkout
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards &&
    ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])
      ?.length > 0 &&
    cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#CFCFD4]/60 shadow-sm mt-6">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-2xl font-bold text-[#1E1F74] gap-x-2 items-center",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            },
          )}
        >
          <span>{t.review}</span>
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full bg-[#F5F5F7] p-4 rounded-xl border border-[#CFCFD4]/40">
              <Text className="text-xs text-[#1E1F74]/80 leading-relaxed">
                {t.disclaimerPrefix}<strong>{t.placeOrder}</strong>{t.disclaimerSuffix}
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
