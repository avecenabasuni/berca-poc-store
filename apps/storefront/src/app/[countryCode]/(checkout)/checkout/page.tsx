import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Heading, Text } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"

export const metadata: Metadata = {
  title: "Checkout Berca Store",
}

export default async function Checkout(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const t = getDictionary(countryCode).checkout
  const [cart, customer] = await Promise.all([
    retrieveCart(undefined, undefined, countryCode),
    retrieveCustomer(),
  ])

  if (!cart) {
    return notFound()
  }

  return (
    <div className="content-container py-10 small:py-14">
      <div className="mb-8 max-w-2xl small:mb-10">
        <span className="text-xs font-semibold uppercase tracking-widest text-content-interactive">
          {t.eyebrow}
        </span>
        <Heading
          level="h1"
          className="mt-3 text-3xl text-content-primary small:text-4xl"
        >
          {t.title}
        </Heading>
        <Text className="mt-3 max-w-xl text-pretty text-content-secondary">
          {t.description}
        </Text>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-y-8 small:grid-cols-[minmax(0,1fr)_416px] small:gap-x-10 medium:gap-x-12">
        <PaymentWrapper cart={cart}>
          <CheckoutForm cart={cart} customer={customer} />
        </PaymentWrapper>
        <CheckoutSummary cart={cart} />
      </div>
    </div>
  )
}
