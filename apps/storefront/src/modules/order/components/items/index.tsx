import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Table } from "@modules/common/components/ui"

import Divider from "@modules/common/components/divider"
import Item from "@modules/order/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsProps = {
  order: HttpTypes.StoreOrder
}

const Items = ({ order }: ItemsProps) => {
  const items = order.items

  return (
    <div className="flex flex-col">
      <Divider className="!mb-0" />
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label="Produk dalam pesanan"
        tabIndex={0}
      >
        <Table>
          <caption className="sr-only">Produk dalam pesanan ini</caption>
          <Table.Header className="sr-only">
            <Table.Row>
              <Table.HeaderCell>Gambar produk</Table.HeaderCell>
              <Table.HeaderCell>Produk</Table.HeaderCell>
              <Table.HeaderCell>Jumlah dan total</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body data-testid="products-table">
          {items?.length
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                })
                .map((item) => {
                  return (
                    <Item
                      key={item.id}
                      item={item}
                      currencyCode={order.currency_code}
                    />
                  )
                })
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />
              })}
          </Table.Body>
        </Table>
      </div>
    </div>
  )
}

export default Items
