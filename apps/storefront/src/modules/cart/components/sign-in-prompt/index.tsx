import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="bg-white flex items-center justify-between">
      <div>
        <Heading level="h2" className="txt-xlarge">
          Already have an account?
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle mt-2">
          Sign in for a better experience.
        </Text>
      </div>
      <div>
        <LocalizedClientLink
          href="/account"
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#1E1F74] px-4 font-medium text-white hover:bg-[#3A1E65] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          data-testid="sign-in-button"
        >
          Sign in
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
