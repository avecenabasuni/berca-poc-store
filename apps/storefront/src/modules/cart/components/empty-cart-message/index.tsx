import { Heading, Text } from "@modules/common/components/ui"

import InteractiveLink from "@modules/common/components/interactive-link"
import { getDictionary } from "@lib/i18n"

const EmptyCartMessage = () => {
  const t = getDictionary().cart

  return (
    <div className="py-48 px-2 flex flex-col justify-center items-start" data-testid="empty-cart-message">
      <Heading
        level="h1"
        className="flex flex-row text-3xl-regular gap-x-2 items-baseline"
      >
        {t.title}
      </Heading>
      <Text className="text-base-regular mt-4 mb-6 max-w-[32rem]">
        {t.emptyDescription}
      </Text>
      <div>
        <InteractiveLink href="/store">{t.explore}</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
