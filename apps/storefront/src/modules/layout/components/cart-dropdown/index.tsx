"use client"

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import { ShoppingBag } from "@medusajs/icons"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "@modules/products/components/thumbnail"
import { useParams } from "next/navigation"
import { getDictionary } from "@lib/i18n"
import { Fragment, useEffect, useRef, useState } from "react"

const CartIndicator = ({ totalItems }: { totalItems: number }) => (
  <>
    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
    <span
      aria-hidden="true"
      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface-default bg-action-primary px-1 text-xs font-bold tabular-nums text-content-inverse shadow-sm"
    >
      {totalItems}
    </span>
  </>
)

const CartDropdown = ({
  cart: cartState,
}: {
  cart?: HttpTypes.StoreCart | null
}) => {
  const { countryCode } = useParams()
  const t = getDictionary(countryCode).cart

  const totalItems =
    cartState?.items?.reduce((acc, item) => {
      return acc + item.quantity
    }, 0) || 0

  const subtotal = cartState?.subtotal ?? 0
  const previousItemCount = useRef(totalItems)
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    if (previousItemCount.current !== totalItems) {
      setStatusMessage(`${t.title} diperbarui. ${totalItems} ${t.items}.`)
      previousItemCount.current = totalItems
    }
  }, [t.items, t.title, totalItems])

  return (
    <>
      <p className="sr-only" role="status" aria-atomic="true">
        {statusMessage}
      </p>
      <div className="z-50 flex h-full items-center">
        <LocalizedClientLink
          href="/cart"
          className="relative flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-2.5 text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96] small:hidden"
          data-testid="nav-cart-link"
          aria-label={`${t.title}, ${totalItems} ${t.items}`}
        >
          <CartIndicator totalItems={totalItems} />
        </LocalizedClientLink>
        <Popover className="relative hidden h-full items-center small:flex">
        {({ open, close }) => (
          <>
            <PopoverButton
              className="relative flex h-full min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-2.5 text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
              data-testid="nav-cart-button"
              aria-label={`${t.title}, ${totalItems} ${t.items}`}
            >
              <CartIndicator totalItems={totalItems} />
            </PopoverButton>
            <Transition
              show={open}
              as={Fragment}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-out duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <PopoverPanel
                static
                aria-label={t.title}
                className="surface-elevated hidden small:block absolute top-[calc(100%+12px)] right-0 z-[100] w-[min(480px,calc(100vw-3rem))] rounded-2xl bg-surface-default text-content-primary"
                data-testid="nav-cart-dropdown"
              >
            <div className="p-4 flex items-center justify-between border-b border-line-subtle/40">
              <h3 className="text-base font-bold text-content-primary">{t.title}</h3>
              <span className="text-xs text-content-muted font-medium">{totalItems} {t.items}</span>
            </div>
            {cartState && cartState.items?.length ? (
              <>
                <div className="overflow-y-scroll max-h-[380px] p-4 flex flex-col gap-y-6 no-scrollbar">
                  {cartState.items
                    .sort((a, b) => {
                      return (a.created_at ?? "") > (b.created_at ?? "")
                        ? -1
                        : 1
                    })
                    .map((item) => (
                      <div
                        className="grid grid-cols-[72px_1fr] gap-x-4 pb-4 border-b border-line-subtle/30 last:border-b-0 last:pb-0"
                        key={item.id}
                        data-testid="cart-item"
                      >
                        <LocalizedClientLink
                          href={`/products/${item.product_handle}`}
                          className="w-18 h-18 rounded-lg overflow-hidden border border-line-subtle/40 flex-shrink-0"
                        >
                          <Thumbnail
                            thumbnail={item.thumbnail}
                            images={item.variant?.product?.images}
                            size="square"
                            alt={item.product_title || item.title}
                          />
                        </LocalizedClientLink>
                        <div className="flex flex-col justify-between flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-x-3">
                            <div className="flex flex-col flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-content-primary truncate">
                                <LocalizedClientLink
                                  href={`/products/${item.product_handle}`}
                                  data-testid="product-link"
                                >
                                  {item.title}
                                </LocalizedClientLink>
                              </h3>
                              <LineItemOptions
                                variant={item.variant}
                                data-testid="cart-item-variant"
                                data-value={item.variant}
                              />
                              <span
                                className="text-xs text-content-secondary mt-0.5"
                                data-testid="cart-item-quantity"
                                data-value={item.quantity}
                              >
                                {t.quantity}: {item.quantity}
                              </span>
                            </div>
                            <div className="flex justify-end flex-shrink-0 text-right text-sm font-bold text-content-primary">
                              <LineItemPrice
                                item={item}
                                style="tight"
                                currencyCode={cartState.currency_code}
                              />
                            </div>
                          </div>
                          <DeleteButton
                            id={item.id}
                            className="mt-2 text-xs text-error-foreground hover:underline self-start"
                            data-testid="cart-item-remove-button"
                          >
                            {t.remove}
                          </DeleteButton>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="p-5 flex flex-col gap-y-4 bg-surface-subtle rounded-b-2xl border-t border-line-subtle/40">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-content-primary">
                      {t.subtotal}
                    </span>
                    <span
                      className="text-lg font-bold tabular-nums text-content-primary"
                      data-testid="cart-subtotal"
                      data-value={subtotal}
                    >
                      {convertToLocale({
                        amount: subtotal,
                        currency_code: cartState.currency_code,
                      })}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href="/cart"
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action-primary px-6 text-lg font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                    data-testid="go-to-cart-button"
                  >
                    {t.viewCart}
                  </LocalizedClientLink>
                </div>
              </>
            ) : (
              <div>
                <div className="flex py-12 flex-col gap-y-4 items-center justify-center">
                  <div className="bg-surface-inverse text-xs flex items-center justify-center w-8 h-8 rounded-full text-content-inverse font-bold">
                    <span>0</span>
                  </div>
                  <span className="text-sm font-medium text-content-secondary">{t.empty}</span>
                  <div>
                    <LocalizedClientLink
                      href="/store"
                      className="inline-flex min-h-11 items-center justify-center rounded-md bg-action-primary px-4 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                      onClick={close}
                    >
                      {t.explore}
                    </LocalizedClientLink>
                  </div>
                </div>
              </div>
            )}
              </PopoverPanel>
            </Transition>
          </>
        )}
        </Popover>
      </div>
    </>
  )
}

export default CartDropdown
