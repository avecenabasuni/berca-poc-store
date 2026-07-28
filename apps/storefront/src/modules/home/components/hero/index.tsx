import { Button, Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="relative h-[85vh] w-full overflow-hidden">
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1920&q=80"
          alt="Berca Store - Koleksi fashion terbaru"
          className="h-full w-full object-cover"
          priority="true"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1E1F74]/95 via-[#3A1E65]/80 to-[#782046]/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="content-container flex flex-col gap-6 max-w-2xl">
          <span className="text-[#E53946] bg-[#E53946]/10 backdrop-blur-sm border border-[#E53946]/30 uppercase tracking-widest text-xs font-semibold px-3 py-1.5 rounded-full w-fit">
            Koleksi Terbaru 2026
          </span>
          <Heading
            level="h1"
            className="text-4xl small:text-6xl leading-tight text-white font-bold"
          >
            Belanja Lebih Mudah,{" "}
            <span className="text-[#E53946]">Lebih Cepat</span>
          </Heading>
          <Text className="text-[#F5F5F7]/90 text-lg max-w-md font-normal leading-relaxed">
            Temukan berbagai pilihan produk berkualitas dengan harga terbaik.
            Pengiriman cepat ke seluruh Indonesia.
          </Text>
          <div className="flex gap-4 mt-4">
            <LocalizedClientLink href="/store">
              <Button variant="primary" className="w-fit font-semibold px-6 py-3 shadow-lg shadow-[#E53946]/30">
                Belanja Sekarang
              </Button>
            </LocalizedClientLink>
            <LocalizedClientLink href="/collections">
              <Button
                variant="transparent"
                className="w-fit bg-white/10 border border-white/30 text-white hover:bg-white/20 font-medium"
              >
                Lihat Koleksi
              </Button>
            </LocalizedClientLink>
          </div>
        </div>
      </div>

      {/* Bottom decorative bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-[#1E1F74]/90 backdrop-blur-md border-t border-[#3A1E65]">
        <div className="content-container py-3">
          <div className="flex items-center justify-between text-[#F5F5F7]/80 text-xs uppercase tracking-wider font-medium">
            <span>Pengiriman Gratis</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span>Garansi Resmi</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span>Bayar di Tempat</span>
            <span className="hidden small:inline text-[#782046]">|</span>
            <span className="hidden small:inline">Customer Service 24/7</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
