import { Heading, Text } from "@modules/common/components/ui"

import CartTotals from "@modules/common/components/cart-totals"
import Items from "@modules/order/components/items"
import OrderDetails from "@modules/order/components/order-details"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"
import { CheckCircleSolid } from "@medusajs/icons"
import { getDictionary } from "@lib/i18n"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const t = getDictionary().order

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]">
      <div className="content-container flex flex-col justify-center items-center gap-y-10 max-w-4xl h-full w-full">
        <div
          className="surface-elevated flex h-full w-full max-w-4xl flex-col gap-4 rounded-2xl bg-surface-default p-6 xsmall:p-10"
          data-testid="order-complete-container"
        >
          <div className="mb-4 flex items-start gap-4 rounded-xl bg-success-background p-4 text-success-foreground">
            <CheckCircleSolid className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            <div>
              <Heading level="h1" className="text-3xl text-success-foreground">
                {t.success}
              </Heading>
              <Text className="mt-1 text-pretty text-success-foreground">
                {t.successDescription}
              </Text>
            </div>
          </div>
          <OrderDetails order={order} />
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            {t.summary}
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
        </div>
      </div>
    </div>
  )
}
