import { Container } from "@modules/common/components/ui"

import ChevronDown from "@modules/common/icons/chevron-down"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders }: OverviewProps) => {
  return (
    <div data-testid="overview-page-wrapper">
      <h1 className="mb-6 text-2xl-semi">Account overview</h1>
      <div className="hidden small:block">
        <div className="text-xl-semi flex justify-between items-center mb-4">
          <span data-testid="welcome-message" data-value={customer?.first_name}>
            Hello {customer?.first_name}
          </span>
          <span className="text-small-regular text-ui-fg-base">
            Signed in as:{" "}
            <span
              className="font-semibold"
              data-testid="customer-email"
              data-value={customer?.email}
            >
              {customer?.email}
            </span>
          </span>
        </div>
        <div className="flex flex-col py-8 border-t border-gray-200">
          <div className="flex flex-col gap-y-4 h-full col-span-1 row-span-2 flex-1">
            <div className="flex items-start gap-x-16 mb-6">
              <div className="flex flex-col gap-y-4">
                <h2 className="text-large-semi">Profile</h2>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="customer-profile-completion"
                    data-value={getProfileCompletion(customer)}
                  >
                    {getProfileCompletion(customer)}%
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    Completed
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-y-4">
                <h2 className="text-large-semi">Addresses</h2>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="addresses-count"
                    data-value={customer?.addresses?.length || 0}
                  >
                    {customer?.addresses?.length || 0}
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    Saved
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-2">
                <h2 className="text-large-semi">Recent orders</h2>
              </div>
              <ul
                className="flex flex-col gap-y-4"
                data-testid="orders-wrapper"
              >
                {orders && orders.length > 0 ? (
                  orders.slice(0, 5).map((order) => {
                    return (
                      <li
                        key={order.id}
                        data-testid="order-wrapper"
                        data-value={order.id}
                      >
                        <LocalizedClientLink
                          href={`/account/orders/details/${order.id}`}
                          className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <Container className="flex items-center justify-between gap-4 bg-gray-50 p-4">
                            <div className="grid flex-1 grid-cols-1 gap-3 text-small-regular xsmall:grid-cols-3">
                              <span className="flex flex-col">
                                <span className="font-semibold">Date placed</span>
                                <span data-testid="order-created-date">
                                  {new Date(order.created_at).toDateString()}
                                </span>
                              </span>
                              <span className="flex flex-col">
                                <span className="font-semibold">Order number</span>
                                <span
                                  data-testid="order-id"
                                  data-value={order.display_id}
                                >
                                  #{order.display_id}
                                </span>
                              </span>
                              <span className="flex flex-col">
                                <span className="font-semibold">Total amount</span>
                                <span data-testid="order-amount">
                                  {convertToLocale({
                                    amount: order.total,
                                    currency_code: order.currency_code,
                                  })}
                                </span>
                              </span>
                            </div>
                            <span className="sr-only">
                              Go to order #{order.display_id}
                            </span>
                            <span
                              className="flex min-h-11 min-w-11 items-center justify-center"
                              data-testid="open-order-button"
                              aria-hidden="true"
                            >
                              <ChevronDown className="-rotate-90" />
                            </span>
                          </Container>
                        </LocalizedClientLink>
                      </li>
                    )
                  })
                ) : (
                  <li data-testid="no-orders-message">No recent orders</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const getProfileCompletion = (customer: HttpTypes.StoreCustomer | null) => {
  let count = 0

  if (!customer) {
    return 0
  }

  if (customer.email) {
    count++
  }

  if (customer.first_name && customer.last_name) {
    count++
  }

  if (customer.phone) {
    count++
  }

  const billingAddress = customer.addresses?.find(
    (addr) => addr.is_default_billing
  )

  if (billingAddress) {
    count++
  }

  return (count / 4) * 100
}

export default Overview
