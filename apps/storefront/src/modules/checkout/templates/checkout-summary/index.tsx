import { Heading } from "@modules/common/components/ui"

import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import DiscountCode from "@modules/checkout/components/discount-code"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import { HttpTypes } from "@medusajs/types"

const CheckoutSummary = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  return (
    <div className="sticky top-24 flex flex-col-reverse small:flex-col gap-y-8 py-8 small:py-0">
      <div className="w-full bg-white p-6 sm:p-8 rounded-2xl border border-[#CFCFD4]/60 shadow-sm flex flex-col">
        <Divider className="my-4 small:hidden" />
        <Heading
          level="h2"
          className="flex flex-row text-2xl font-bold text-[#1E1F74] items-baseline justify-between"
        >
          <span>Ringkasan Pesanan</span>
        </Heading>
        <Divider className="my-4 border-[#CFCFD4]/50" />
        <CartTotals totals={cart} />
        <div className="my-4">
          <ItemsPreviewTemplate cart={cart} />
        </div>
        <div className="mt-4 pt-4 border-t border-[#CFCFD4]/50">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary
