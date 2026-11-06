import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";

/** Ported from web/src/components/_home/hero-banner.tsx. */
export function HeroBanner() {
  return (
    <section
      className="relative overflow-hidden bg-cover bg-center md:min-h-95"
      style={{ backgroundImage: "url('/hands.webp')" }}
    >
      {/* Branded blue wash over the photo */}
      <div className="absolute inset-0 bg-primary-blue opacity-60 mix-blend-color" />
      <div className="absolute inset-0 bg-primary-blue/30" />

      <div className="relative flex max-w-4xl flex-col gap-6 px-6 py-12 md:px-14 md:py-16">
        <h1 className="m-0 font-breadDisplay text-5xl font-black uppercase leading-[0.95] tracking-tight text-paper-2 md:text-7xl lg:text-[5.5rem]">
          Save money
          <br />
          together faster
        </h1>
        <p className="m-0 text-xl font-bold text-paper-2 md:text-2xl">
          Add friends, deposit each round, take turns getting paid.
        </p>
        <div>
          <ButtonLink href="/new/" leftIcon={<PlusIcon size={20} weight="bold" />}>
            Create new circle
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
