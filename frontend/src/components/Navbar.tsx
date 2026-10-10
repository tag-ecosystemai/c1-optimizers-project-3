import { Button } from "./ui/Button";
import { ArrowRight } from "./ui/icons";
import { Logo } from "./ui/Logo";

const links = [
  { label: "How it works", href: "#predict-late-orders" },
  { label: "Contact", href: "#" },
];

/** Sticky header: announcement banner + nav. Its height is --site-header-height (globals.css). */
export function Navbar() {
  return (
    <header className="sticky top-0 z-90 border-b border-subtle-stroke bg-primary-background/95 backdrop-blur-md">
      <div className="dark flex h-(--site-header-banner-height) items-center bg-banner-background shadow-soft">
        <a href="#find-the-cause" className="group container flex items-center justify-center gap-1.5 text-[13px]/5 font-medium text-primary-foreground max-md:justify-start">
          <span className="hover-underline truncate">See how one late order becomes a decision your team can approve</span>
          <ArrowRight className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
        </a>
      </div>
      <nav className="container flex items-center justify-between pt-2 pb-[7px] lg:pt-4 lg:pb-[15px]">
        <div className="flex items-center gap-x-9">
          <a href="#" aria-label="RunOut homepage" className="-mx-1 -my-2 rounded-xl px-1 py-2 text-primary-foreground">
            <Logo className="h-6 w-auto" />
          </a>
          <ul className="hidden items-center gap-x-1.5 lg:flex">
            {links.map(({ label, href }) => (
              <li key={label}>
                <Button href={href} variant="ghost" className="text-[15px]">
                  {label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-x-2.5">
          <Button href="/login" variant="outline" className="max-lg:hidden">
            Sign in
          </Button>
          <Button href="#">Get started</Button>
        </div>
      </nav>
    </header>
  );
}
