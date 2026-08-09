"use client"

import { convertToLocale } from "@lib/util/money"
import React from "react"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
  }
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals }) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).checkout

  const {
    currency_code,
    total,
    tax_total,
    item_subtotal,
    shipping_subtotal,
    discount_subtotal,
  } = totals

  return (
    <div>
      <div className="flex flex-col gap-y-2 text-sm text-content-secondary">
        <div className="flex items-center justify-between">
          <span>{t.subtotal}</span>
          <span
            className="tabular-nums"
            data-testid="cart-subtotal"
            data-value={item_subtotal || 0}
          >
            {convertToLocale({ amount: item_subtotal ?? 0, currency_code })}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>{t.shipping}</span>
          <span
            className="tabular-nums"
            data-testid="cart-shipping"
            data-value={shipping_subtotal || 0}
          >
            {convertToLocale({ amount: shipping_subtotal ?? 0, currency_code })}
          </span>
        </div>
        {!!discount_subtotal && (
          <div className="flex items-center justify-between">
            <span>Diskon</span>
            <span
              className="text-success-foreground tabular-nums"
              data-testid="cart-discount"
              data-value={discount_subtotal || 0}
            >
              -{" "}
              {convertToLocale({
                amount: discount_subtotal ?? 0,
                currency_code,
              })}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="flex gap-x-1 items-center">{t.taxes}</span>
          <span
            className="tabular-nums"
            data-testid="cart-taxes"
            data-value={tax_total || 0}
          >
            {convertToLocale({ amount: tax_total ?? 0, currency_code })}
          </span>
        </div>
      </div>
      <div className="my-4 h-px w-full border-b border-line-subtle/40" />
      <div className="mb-2 flex items-center justify-between text-base font-bold text-content-primary">
        <span>{t.total}</span>
        <span
          className="text-xl font-extrabold tabular-nums text-content-primary"
          data-testid="cart-total"
          data-value={total || 0}
        >
          {convertToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>
      <div className="mt-4 h-px w-full border-b border-line-subtle/40" />
    </div>
  )
}

export default CartTotals
