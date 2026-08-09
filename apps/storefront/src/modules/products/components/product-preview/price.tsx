import { Text, clx } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      {price.price_type === "sale" && (
        <Text
          className="text-sm tabular-nums text-content-muted line-through"
          data-testid="original-price"
        >
          {price.original_price}
        </Text>
      )}
      <Text
        className={clx(
          "text-base font-medium tabular-nums text-content-secondary",
          {
            "text-content-interactive": price.price_type === "sale",
          },
        )}
        data-testid="price"
      >
        {price.calculated_price}
      </Text>
    </>
  )
}
