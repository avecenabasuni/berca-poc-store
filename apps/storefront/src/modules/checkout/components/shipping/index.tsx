"use client"
import { Radio, RadioGroup } from "@headlessui/react"
import { setShippingMethod } from "@lib/data/cart"
import { calculatePriceForShippingOption } from "@lib/data/fulfillment"
import { getDictionary } from "@lib/i18n"
import { convertToLocale } from "@lib/util/money"
import { CheckCircleSolid, Loader } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import ErrorMessage from "@modules/checkout/components/error-message"
import Divider from "@modules/common/components/divider"
import MedusaRadio from "@modules/common/components/radio"
import { Button, clx, Heading, Text } from "@modules/common/components/ui"
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation"
import { useEffect, useState } from "react"

const PICKUP_OPTION_ON = "__PICKUP_ON"
const PICKUP_OPTION_OFF = "__PICKUP_OFF"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[] | null
}

function formatAddress(address: HttpTypes.StoreCartAddress) {
  if (!address) {
    return ""
  }

  let ret = ""

  if (address.address_1) {
    ret += ` ${address.address_1}`
  }

  if (address.address_2) {
    ret += `, ${address.address_2}`
  }

  if (address.postal_code) {
    ret += `, ${address.postal_code} ${address.city}`
  }

  if (address.country_code) {
    ret += `, ${address.country_code.toUpperCase()}`
  }

  return ret
}

const Shipping: React.FC<ShippingProps> = ({
  cart,
  availableShippingMethods,
}) => {
  const countryCode = useParams().countryCode as string
  const t = getDictionary(countryCode).checkout
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPrices, setIsLoadingPrices] = useState(true)

  const [showPickupOptions, setShowPickupOptions] =
    useState<string>(PICKUP_OPTION_OFF)
  const [calculatedPricesMap, setCalculatedPricesMap] = useState<
    Record<string, number>
  >({})
  const [error, setError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null,
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "delivery"

  const _shippingMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: {
              type?: string
              location?: { address: HttpTypes.StoreCartAddress }
            }
          }
        }
      ).service_zone?.fulfillment_set?.type !== "pickup",
  )

  const _pickupMethods = availableShippingMethods?.filter(
    (sm) =>
      (
        sm as unknown as {
          service_zone?: {
            fulfillment_set?: {
              type?: string
              location?: { address: HttpTypes.StoreCartAddress }
            }
          }
        }
      ).service_zone?.fulfillment_set?.type === "pickup",
  )

  const hasPickupOptions = !!_pickupMethods?.length
  const hasSelectablePickupOption = !!_pickupMethods?.some(
    (option) => !option.insufficient_inventory,
  )
  const hasSelectableShippingOption = !!_shippingMethods?.some(
    (option) =>
      option.price_type === "flat" ||
      typeof calculatedPricesMap[option.id] === "number",
  )
  const isDeliveryUnavailable =
    !isLoadingPrices &&
    !hasSelectablePickupOption &&
    !hasSelectableShippingOption

  useEffect(() => {
    let isCurrent = true
    setIsLoadingPrices(true)

    const calculatedShippingMethods = (availableShippingMethods ?? []).filter(
      (sm) =>
        (
          sm as unknown as {
            service_zone?: { fulfillment_set?: { type?: string } }
          }
        ).service_zone?.fulfillment_set?.type !== "pickup" &&
        sm.price_type === "calculated",
    )

    if (!calculatedShippingMethods.length) {
      setCalculatedPricesMap({})
      setIsLoadingPrices(false)
    } else {
      Promise.allSettled(
        calculatedShippingMethods.map((sm) =>
          calculatePriceForShippingOption(sm.id, cart.id),
        ),
      ).then((res) => {
        if (isCurrent) {
          const pricesMap: Record<string, number> = {}
          res
            .filter((r) => r.status === "fulfilled")
            .forEach((p) => {
              if (p.value?.id) {
                pricesMap[p.value.id] = p.value.amount ?? 0
              }
            })

          setCalculatedPricesMap(pricesMap)
          setIsLoadingPrices(false)
        }
      })
    }

    const selectedShippingMethod = availableShippingMethods?.find(
      (method) => method.id === shippingMethodId,
    )
    const isPickupSelected =
      (
        selectedShippingMethod as unknown as {
          service_zone?: { fulfillment_set?: { type?: string } }
        }
      )?.service_zone?.fulfillment_set?.type === "pickup"

    if (isPickupSelected) {
      setShowPickupOptions(PICKUP_OPTION_ON)
    } else {
      setShowPickupOptions(PICKUP_OPTION_OFF)
    }

    return () => {
      isCurrent = false
    }
  }, [availableShippingMethods, cart.id, shippingMethodId])

  const handleEdit = () => {
    router.push(pathname + "?step=delivery", { scroll: false })
  }

  const handleAddressEdit = () => {
    router.push(pathname + "?step=address", { scroll: false })
  }

  const handleSubmit = () => {
    router.push(pathname + "?step=payment", { scroll: false })
  }

  const handleSetShippingMethod = async (
    id: string,
    variant: "shipping" | "pickup",
  ) => {
    setError(null)

    if (variant === "pickup") {
      setShowPickupOptions(PICKUP_OPTION_ON)
    } else {
      setShowPickupOptions(PICKUP_OPTION_OFF)
    }

    let currentId: string | null = null
    setIsLoading(true)
    setShippingMethodId((prev) => {
      currentId = prev
      return id
    })

    await setShippingMethod({ cartId: cart.id, shippingMethodId: id })
      .catch((err) => {
        setShippingMethodId(currentId)

        setError(err.message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="surface-elevated mt-6 rounded-2xl border border-line-subtle/60 bg-surface-default p-6 sm:p-8">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row items-center gap-x-3 text-2xl font-bold text-content-primary",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && cart.shipping_methods?.length === 0,
            },
          )}
        >
          <span>{t.shippingMethod}</span>
          {!isOpen && (cart.shipping_methods?.length ?? 0) > 0 && (
            <CheckCircleSolid
              className="h-6 w-6 text-success-indicator"
              aria-hidden="true"
            />
          )}
        </Heading>
        {!isOpen &&
          cart?.shipping_address &&
          cart?.billing_address &&
          cart?.email && (
            <Text>
              <button
                onClick={handleEdit}
                className="rounded-sm font-semibold text-content-interactive hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-testid="edit-delivery-button"
              >
                {t.edit}
              </button>
            </Text>
          )}
      </div>
      {isOpen ? (
        <>
          <div className="grid">
            <div className="flex flex-col">
              <span className="font-medium txt-medium text-ui-fg-base">
                {t.shippingMethod}
              </span>
              <span className="mb-4 text-ui-fg-muted txt-medium">
                {t.chooseDelivery}
              </span>
            </div>
            <div data-testid="delivery-options-container">
              <div className="pb-8 md:pt-0 pt-2">
                {isDeliveryUnavailable ? (
                  <div
                    className="rounded-xl border border-warning-foreground/30 bg-warning-background p-4"
                    role="status"
                  >
                    <p className="font-semibold text-warning-foreground">
                      {t.shippingUnavailableTitle}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-warning-foreground">
                      {t.shippingUnavailableDescription}
                    </p>
                  </div>
                ) : (
                  <>
                    {hasPickupOptions && (
                      <RadioGroup
                        aria-label={t.shippingMethod}
                        value={showPickupOptions}
                        onChange={(_value) => {
                          const id = _pickupMethods.find(
                            (option) => !option.insufficient_inventory,
                          )?.id

                          if (id) {
                            handleSetShippingMethod(id, "pickup")
                          }
                        }}
                      >
                        <Radio
                          value={PICKUP_OPTION_ON}
                          data-testid="delivery-option-radio"
                          className={clx(
                            "mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-line-control bg-surface-default px-4 py-4 text-sm motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.99] xsmall:px-6",
                            {
                              "border-action-primary bg-surface-subtle":
                                showPickupOptions === PICKUP_OPTION_ON,
                            },
                          )}
                        >
                          <div className="flex items-center gap-x-4">
                            <MedusaRadio
                              checked={showPickupOptions === PICKUP_OPTION_ON}
                            />
                            <span className="text-base-regular">
                              {t.pickup}
                            </span>
                          </div>
                          <span className="justify-self-end text-ui-fg-base">
                            -
                          </span>
                        </Radio>
                      </RadioGroup>
                    )}
                    <RadioGroup
                      aria-label={t.shippingMethod}
                      value={shippingMethodId}
                      onChange={(v) => {
                        if (v) {
                          return handleSetShippingMethod(v, "shipping")
                        }
                      }}
                    >
                      {_shippingMethods?.map((option) => {
                        const isDisabled =
                          option.price_type === "calculated" &&
                          !isLoadingPrices &&
                          typeof calculatedPricesMap[option.id] !== "number"

                        return (
                          <Radio
                            key={option.id}
                            value={option.id}
                            data-testid="delivery-option-radio"
                            disabled={isDisabled}
                            className={clx(
                              "mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-line-control bg-surface-default px-4 py-4 text-sm motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.99] xsmall:px-6",
                              {
                                "border-action-primary bg-surface-subtle":
                                  option.id === shippingMethodId,
                                "hover:shadow-none cursor-not-allowed":
                                  isDisabled,
                              },
                            )}
                          >
                            <div className="flex items-center gap-x-4">
                              <MedusaRadio
                                checked={option.id === shippingMethodId}
                              />
                              <span className="text-base-regular">
                                {option.name}
                              </span>
                            </div>
                            <span className="justify-self-end tabular-nums text-ui-fg-base">
                              {option.price_type === "flat" ? (
                                convertToLocale({
                                  amount: option.amount!,
                                  currency_code: cart?.currency_code,
                                })
                              ) : typeof calculatedPricesMap[option.id] ===
                                "number" ? (
                                convertToLocale({
                                  amount: calculatedPricesMap[option.id],
                                  currency_code: cart?.currency_code,
                                })
                              ) : isLoadingPrices ? (
                                <Loader />
                              ) : (
                                "-"
                              )}
                            </span>
                          </Radio>
                        )
                      })}
                    </RadioGroup>
                  </>
                )}
              </div>
            </div>
          </div>

          {showPickupOptions === PICKUP_OPTION_ON && (
            <div className="grid">
              <div className="flex flex-col">
                <span className="font-medium txt-medium text-ui-fg-base">
                  {t.pickupLocation}
                </span>
                <span className="mb-4 text-ui-fg-muted txt-medium">
                  {t.chooseStore}
                </span>
              </div>
              <div data-testid="delivery-options-container">
                <div className="pb-8 md:pt-0 pt-2">
                  <RadioGroup
                    aria-label={t.pickupLocation}
                    value={shippingMethodId}
                    onChange={(v) => {
                      if (v) {
                        return handleSetShippingMethod(v, "pickup")
                      }
                    }}
                  >
                    {_pickupMethods?.map((option) => {
                      return (
                        <Radio
                          key={option.id}
                          value={option.id}
                          disabled={option.insufficient_inventory}
                          data-testid="delivery-option-radio"
                          className={clx(
                            "mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-line-control bg-surface-default px-4 py-4 text-sm motion-safe:transition-[background-color,border-color,scale] motion-safe:duration-150 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.99] xsmall:px-6",
                            {
                              "border-action-primary bg-surface-subtle":
                                option.id === shippingMethodId,
                              "hover:shadow-none cursor-not-allowed":
                                option.insufficient_inventory,
                            },
                          )}
                        >
                          <div className="flex items-start gap-x-4">
                            <MedusaRadio
                              checked={option.id === shippingMethodId}
                            />
                            <div className="flex flex-col">
                              <span className="text-base-regular">
                                {option.name}
                              </span>
                              <span className="text-base-regular text-ui-fg-muted">
                                {formatAddress(
                                  (
                                    option as unknown as {
                                      service_zone?: {
                                        fulfillment_set?: {
                                          location?: {
                                            address: HttpTypes.StoreCartAddress
                                          }
                                        }
                                      }
                                    }
                                  ).service_zone?.fulfillment_set?.location
                                    ?.address as HttpTypes.StoreCartAddress,
                                )}
                              </span>
                            </div>
                          </div>
                          <span className="justify-self-end tabular-nums text-ui-fg-base">
                            {convertToLocale({
                              amount: option.amount!,
                              currency_code: cart?.currency_code,
                            })}
                          </span>
                        </Radio>
                      )
                    })}
                  </RadioGroup>
                </div>
              </div>
            </div>
          )}

          <div>
            <ErrorMessage
              error={error}
              data-testid="delivery-option-error-message"
            />
            {isDeliveryUnavailable ? (
              <Button
                size="large"
                className="mt-6"
                onClick={handleAddressEdit}
                data-testid="return-to-address-button"
              >
                {t.returnToAddress}
              </Button>
            ) : (
              <Button
                size="large"
                className="mt-6"
                onClick={handleSubmit}
                isLoading={isLoading}
                disabled={!cart.shipping_methods?.[0]}
                data-testid="submit-delivery-option-button"
              >
                {t.continueToPayment}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div>
          <div className="text-small-regular">
            {cart && (cart.shipping_methods?.length ?? 0) > 0 && (
              <div className="flex min-w-0 flex-col">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  {t.method}
                </Text>
                <Text className="break-words txt-medium text-ui-fg-subtle">
                  {cart.shipping_methods!.at(-1)!.name}{" "}
                  {convertToLocale({
                    amount: cart.shipping_methods!.at(-1)!.amount!,
                    currency_code: cart?.currency_code,
                  })}
                </Text>
              </div>
            )}
          </div>
        </div>
      )}
      <Divider className="mt-8" />
    </div>
  )
}

export default Shipping
