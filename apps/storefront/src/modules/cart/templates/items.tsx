import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Heading, Table } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"
import { getDictionary } from "@lib/i18n"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
}

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  const items = cart?.items
  const t = getDictionary().cart
  return (
    <div>
      <div className="pb-3 flex items-center">
        <Heading level="h1" className="text-[2rem] leading-[2.75rem]">
          {t.title}
        </Heading>
      </div>
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="region"
        aria-label="Produk dalam keranjang belanja"
        tabIndex={0}
      >
        <Table>
          <caption className="sr-only">Produk dalam keranjang belanja</caption>
          <Table.Header className="border-t-0">
          <Table.Row className="text-ui-fg-subtle txt-medium-plus">
            <Table.HeaderCell className="!pl-0">
              <span className="sr-only">Gambar produk</span>
            </Table.HeaderCell>
            <Table.HeaderCell>{t.product}</Table.HeaderCell>
            <Table.HeaderCell>{t.quantity}</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Harga
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              Total
            </Table.HeaderCell>
          </Table.Row>
          </Table.Header>
          <Table.Body>
          {items
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                })
                .map((item) => {
                  return (
                    <Item
                      key={item.id}
                      item={item}
                      currencyCode={cart?.currency_code}
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

export default ItemsTemplate
