import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import { getDictionary } from "@lib/i18n"
import { Heading, Text } from "@modules/common/components/ui"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const [shippingMethods, paymentMethods] = await Promise.all([
    listCartShippingMethods(cart.id).catch(() => null),
    listCartPaymentMethods(cart.region?.id ?? "").catch(() => null),
  ])

  if (!shippingMethods || !paymentMethods) {
    const t = getDictionary().checkout

    return (
      <div className="surface-elevated rounded-2xl bg-surface-default p-6 sm:p-8" role="alert">
        <Heading level="h2" className="text-content-primary">
          {t.loadErrorTitle}
        </Heading>
        <Text className="mt-3 max-w-xl text-pretty text-content-secondary">
          {t.loadErrorDescription}
        </Text>
        <a
          href="?step=address"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-action-primary px-4 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
        >
          {t.reload}
        </a>
      </div>
    )
  }

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />

      <Shipping cart={cart} availableShippingMethods={shippingMethods} />

      <Payment cart={cart} availablePaymentMethods={paymentMethods} />

      <Review cart={cart} />
    </div>
  )
}
