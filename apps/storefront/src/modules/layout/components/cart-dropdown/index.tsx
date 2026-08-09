"use client"

import { Dialog, Transition } from "@headlessui/react"
import { ShoppingBag, XMark } from "@medusajs/icons"
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
  const [isOpen, setIsOpen] = useState(false)

  const closeCart = () => setIsOpen(false)

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
        <div className="hidden h-full items-center small:flex">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="relative flex h-full min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full p-2.5 text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
            data-testid="nav-cart-button"
            aria-label={`${t.title}, ${totalItems} ${t.items}`}
          >
            <CartIndicator totalItems={totalItems} />
          </button>

          <Transition appear show={isOpen} as={Fragment}>
            <Dialog className="relative z-[100]" onClose={closeCart}>
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-out duration-150"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <div
                  className="fixed inset-0 bg-black/40"
                  aria-hidden="true"
                  data-testid="nav-cart-backdrop"
                />
              </Transition.Child>

              <div className="fixed inset-0 flex items-start justify-end p-4 pt-20 small:p-6 small:pt-24">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-200"
                  enterFrom="translate-y-2 opacity-0"
                  enterTo="translate-y-0 opacity-100"
                  leave="ease-out duration-150"
                  leaveFrom="translate-y-0 opacity-100"
                  leaveTo="translate-y-2 opacity-0"
                >
                  <Dialog.Panel
                    className="surface-elevated flex max-h-[calc(100dvh-7rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl bg-surface-default text-content-primary"
                    data-testid="nav-cart-dropdown"
                  >
                    <div className="flex items-center justify-between gap-4 border-b border-line-subtle/40 p-4">
                      <div className="min-w-0">
                        <Dialog.Title className="text-base font-bold text-content-primary">
                          {t.title}
                        </Dialog.Title>
                        <span className="text-xs font-medium text-content-muted">
                          {totalItems} {t.items}
                        </span>
                      </div>
                      <button
                        type="button"
                        autoFocus
                        onClick={closeCart}
                        aria-label={t.close}
                        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-content-secondary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle hover:text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                        data-testid="close-cart-button"
                      >
                        <XMark aria-hidden="true" />
                      </button>
                    </div>
                    {cartState && cartState.items?.length ? (
                      <>
                        <div className="flex max-h-[min(380px,calc(100dvh-22rem))] flex-col gap-y-5 overflow-y-auto overscroll-contain p-4 pr-3">
                          {cartState.items
                            .sort((a, b) => {
                              return (a.created_at ?? "") > (b.created_at ?? "")
                                ? -1
                                : 1
                            })
                            .map((item) => (
                              <div
                                className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 border-b border-line-subtle/30 pb-5 last:border-b-0 last:pb-0"
                                key={item.id}
                                data-testid="cart-item"
                              >
                                <LocalizedClientLink
                                  href={`/products/${item.product_handle}`}
                                  className="size-[72px] shrink-0 self-start overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-black/10"
                                >
                                  <Thumbnail
                                    thumbnail={item.thumbnail}
                                    images={item.variant?.product?.images}
                                    size="square"
                                    className="size-full"
                                    alt={item.product_title || item.title}
                                  />
                                </LocalizedClientLink>
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-content-primary">
                                        <LocalizedClientLink
                                          href={`/products/${item.product_handle}`}
                                          title={item.title}
                                          data-testid="product-link"
                                        >
                                          {item.title}
                                        </LocalizedClientLink>
                                      </h3>
                                      <div className="mt-1">
                                        <LineItemOptions
                                          variant={item.variant}
                                          data-testid="cart-item-variant"
                                          data-value={item.variant}
                                        />
                                      </div>
                                      <span
                                        className="mt-1 block text-xs text-content-secondary"
                                        data-testid="cart-item-quantity"
                                        data-value={item.quantity}
                                      >
                                        {t.quantity}: {item.quantity}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 justify-end text-right text-sm font-bold tabular-nums text-content-primary">
                                      <LineItemPrice
                                        item={item}
                                        style="tight"
                                        currencyCode={cartState.currency_code}
                                      />
                                    </div>
                                  </div>
                                  <DeleteButton
                                    id={item.id}
                                    className="mt-1 self-start text-xs text-error-foreground"
                                    data-testid="cart-item-remove-button"
                                  >
                                    {t.remove}
                                  </DeleteButton>
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3 border-t border-line-subtle/40 bg-surface-subtle p-5">
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
                            href="/checkout"
                            onClick={closeCart}
                            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-action-primary px-6 text-base font-semibold text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                            data-testid="go-to-checkout-button"
                          >
                            {t.goToCheckout}
                          </LocalizedClientLink>
                          <LocalizedClientLink
                            href="/cart"
                            onClick={closeCart}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-line-control bg-surface-default px-6 text-sm font-semibold text-content-primary motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
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
                          <span className="text-sm font-medium text-content-secondary">
                            {t.empty}
                          </span>
                          <div>
                            <LocalizedClientLink
                              href="/store"
                              className="inline-flex min-h-11 items-center justify-center rounded-md bg-action-primary px-4 font-medium text-content-inverse motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
                              onClick={closeCart}
                            >
                              {t.explore}
                            </LocalizedClientLink>
                          </div>
                        </div>
                      </div>
                    )}
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </Dialog>
          </Transition>
        </div>
      </div>
    </>
  )
}

export default CartDropdown
