"use client"

import { convertToLocale } from "@lib/util/money"
import { CheckCircleSolid, XMark } from "@medusajs/icons"
import {
  HttpTypes,
  StoreCart,
  StoreCartShippingOption,
  StorePrice,
} from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button, clx } from "@modules/common/components/ui"
import { useState } from "react"
import { StoreFreeShippingPrice } from "types/global"
import { getDictionary } from "@lib/i18n"

const computeTarget = (
  cart: HttpTypes.StoreCart,
  price: HttpTypes.StorePrice
) => {
  const priceRule = (price.price_rules || []).find(
    (pr) => pr.attribute === "item_total"
  )!

  const currentAmount = cart.item_total
  const targetAmount = parseFloat(priceRule.value)

  if (priceRule.operator === "gt") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount > targetAmount,
      target_remaining:
        currentAmount > targetAmount ? 0 : targetAmount + 1 - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "gte") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount > targetAmount,
      target_remaining:
        currentAmount > targetAmount ? 0 : targetAmount - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "lt") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: targetAmount > currentAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : currentAmount + 1 - targetAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else if (priceRule.operator === "lte") {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: targetAmount > currentAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : currentAmount - targetAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  } else {
    return {
      current_amount: currentAmount,
      target_amount: targetAmount,
      target_reached: currentAmount === targetAmount,
      target_remaining:
        targetAmount > currentAmount ? 0 : targetAmount - currentAmount,
      remaining_percentage: (currentAmount / targetAmount) * 100,
    }
  }
}

export default function ShippingPriceNudge({
  variant = "inline",
  cart,
  shippingOptions,
}: {
  variant?: "popup" | "inline"
  cart: StoreCart
  shippingOptions: StoreCartShippingOption[]
}) {
  if (!cart || !shippingOptions?.length) {
    return
  }

  // Check if any shipping options have a conditional price based on item_total
  const freeShippingPrice = shippingOptions
    .map((shippingOption) => {
      const calculatedPrice = shippingOption.calculated_price

      if (!calculatedPrice) {
        return
      }

      // Get all prices that are:
      // 1. Currency code is same as the cart's
      // 2. Have a rule that is set on item_total
      const validCurrencyPrices = shippingOption.prices.filter(
        (price) =>
          price.currency_code === cart.currency_code &&
          (price.price_rules || []).some(
            (priceRule) => priceRule.attribute === "item_total"
          )
      )

      return validCurrencyPrices.map((price) => {
        return {
          ...price,
          shipping_option_id: shippingOption.id,
          ...computeTarget(cart, price),
        }
      })
    })
    .flat(1)
    .filter(Boolean)
    // We focus here entirely on free shipping, but this can be edited to handle multiple layers
    // of reduced shipping prices.
    .find((price) => price?.amount === 0)

  if (!freeShippingPrice) {
    return
  }

  if (variant === "popup") {
    return <FreeShippingPopup cart={cart} price={freeShippingPrice} />
  } else {
    return <FreeShippingInline cart={cart} price={freeShippingPrice} />
  }
}

function FreeShippingInline({
  cart,
  price,
}: {
  cart: StoreCart
  price: StorePrice & {
    target_reached: boolean
    target_remaining: number
    remaining_percentage: number
  }
}) {
  const t = getDictionary().shippingNudge

  return (
    <div className="bg-surface-subtle p-2 rounded-lg border border-line-subtle">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-content-secondary">
          <div>
            {price.target_reached ? (
              <div className="flex items-center gap-1.5">
                {" "}
                <CheckCircleSolid className="text-success-indicator inline-block" aria-hidden="true" />{" "}
                {t.unlocked}
              </div>
            ) : (
              t.unlock
            )}
          </div>

          <div
            className={clx("visible", {
              "opacity-0 invisible": price.target_reached,
            })}
          >
            {t.only}{" "}
            <span className="tabular-nums text-content-primary">
              {convertToLocale({
                amount: price.target_remaining,
                currency_code: cart.currency_code,
              })}
            </span>{" "}
            {t.remaining}
          </div>
        </div>
        <div className="flex justify-between gap-1">
          <div
            className={clx(
              "h-1 max-w-full rounded-full bg-content-muted motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
              {
                "bg-success-indicator": price.target_reached,
              }
            )}
            style={{ width: `${price.remaining_percentage}%` }}
          ></div>
          <div className="bg-line-subtle h-1 rounded-full w-fit flex-grow"></div>
        </div>
      </div>
    </div>
  )
}

function FreeShippingPopup({
  cart,
  price,
}: {
  cart: StoreCart
  price: StoreFreeShippingPrice
}) {
  const t = getDictionary().shippingNudge
  const [isClosed, setIsClosed] = useState(false)

  return (
    <div
      className={clx(
        "fixed bottom-5 right-5 z-10 flex flex-col items-end gap-2 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out",
        {
          "invisible translate-y-3 opacity-0 delay-1000": price.target_reached,
          "invisible translate-y-3 opacity-0": isClosed,
          "visible translate-y-0 opacity-100": !price.target_reached && !isClosed,
        }
      )}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {price.target_reached
          ? t.unlocked
          : `${t.only} ${convertToLocale({
              amount: price.target_remaining,
              currency_code: cart.currency_code,
            })} ${t.remaining} untuk gratis ongkir`}
      </p>
      <div>
        <Button
          className="min-h-11 min-w-11 rounded-full bg-neutral-900 p-2 text-[15px] shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => setIsClosed(true)}
          aria-label={t.close}
        >
          <XMark aria-hidden="true" />
        </Button>
      </div>

      <div className="surface-elevated w-[min(400px,calc(100vw-2rem))] rounded-lg bg-black p-6 text-white">
        <div className="pb-4">
          <div className="space-y-3">
            <div className="flex justify-between text-[15px] text-neutral-400">
              <div>
                {price.target_reached ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircleSolid className="text-success-indicator inline-block" aria-hidden="true" />{" "}
                    {t.unlocked}
                  </div>
                ) : (
                  t.unlock
                )}
              </div>

              <div
                className={clx("visible", {
                  "opacity-0 invisible": price.target_reached,
                })}
              >
                {t.only}{" "}
                <span className="tabular-nums text-white">
                  {convertToLocale({
                    amount: price.target_remaining,
                    currency_code: cart.currency_code,
                  })}
                </span>{" "}
                {t.remaining}
              </div>
            </div>
            <div className="flex justify-between gap-1">
              <div
                className={clx(
                  "h-1.5 max-w-full rounded-full bg-content-muted motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out",
                  {
                    "bg-success-indicator": price.target_reached,
                  }
                )}
                style={{ width: `${price.remaining_percentage}%` }}
              ></div>
              <div className="bg-zinc-600 h-1.5 rounded-full w-fit flex-grow"></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xsmall:flex-row">
          <LocalizedClientLink
            className="rounded-2xl border border-white bg-transparent px-4 py-2.5 text-[15px] shadow-none outline-none motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out focus-visible:ring-2 focus-visible:ring-white motion-safe:active:scale-[0.96]"
            href="/cart"
          >
            {t.viewCart}
          </LocalizedClientLink>

          <LocalizedClientLink
            className="flex-grow rounded-2xl border border-white bg-white px-4 py-2.5 text-center text-[15px] text-neutral-950 shadow-none outline-none motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out focus-visible:ring-2 focus-visible:ring-white motion-safe:active:scale-[0.96]"
            href="/store"
          >
            {t.viewProducts}
          </LocalizedClientLink>
        </div>
      </div>
    </div>
  )
}
