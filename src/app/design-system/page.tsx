import { oklchToHex } from '@/lib/utils/oklchToHex';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select-shadcn';
import { Label } from '@/components/ui/label';
import AnimationDemo from './_components/AnimationDemo';

/* ------------------------------------------------------------------ */
/*  Token data (copied from globals.css)                               */
/* ------------------------------------------------------------------ */

interface ColorToken {
  name: string;
  cssVar: string;
  light: string;
  dark: string;
}

interface ColorGroup {
  label: string;
  tokens: ColorToken[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: 'Core',
    tokens: [
      { name: 'background', cssVar: '--background', light: 'oklch(0.9885 0.0057 84.5659)', dark: 'oklch(0.2161 0.0061 56.0434)' },
      { name: 'foreground', cssVar: '--foreground', light: 'oklch(0.3660 0.0251 49.6085)', dark: 'oklch(0.9699 0.0013 106.4238)' },
    ],
  },
  {
    label: 'Semantic',
    tokens: [
      { name: 'primary', cssVar: '--primary', light: 'oklch(0.5553 0.1455 48.9975)', dark: 'oklch(0.7049 0.1867 47.6044)' },
      { name: 'primary-foreground', cssVar: '--primary-foreground', light: 'oklch(1.0000 0 0)', dark: 'oklch(1.0000 0 0)' },
      { name: 'secondary', cssVar: '--secondary', light: 'oklch(0.8276 0.0752 74.4400)', dark: 'oklch(0.4444 0.0096 73.6390)' },
      { name: 'secondary-foreground', cssVar: '--secondary-foreground', light: 'oklch(0.4444 0.0096 73.6390)', dark: 'oklch(0.9232 0.0026 48.7171)' },
      { name: 'muted', cssVar: '--muted', light: 'oklch(0.9363 0.0218 83.2637)', dark: 'oklch(0.2330 0.0073 67.4563)' },
      { name: 'muted-foreground', cssVar: '--muted-foreground', light: 'oklch(0.5534 0.0116 58.0708)', dark: 'oklch(0.7161 0.0091 56.2590)' },
      { name: 'accent', cssVar: '--accent', light: 'oklch(0.9000 0.0500 74.9889)', dark: 'oklch(0.3598 0.0497 229.3202)' },
      { name: 'accent-foreground', cssVar: '--accent-foreground', light: 'oklch(0.4444 0.0096 73.6390)', dark: 'oklch(0.9232 0.0026 48.7171)' },
      { name: 'destructive', cssVar: '--destructive', light: 'oklch(0.4437 0.1613 26.8994)', dark: 'oklch(0.5771 0.2152 27.3250)' },
      { name: 'destructive-foreground', cssVar: '--destructive-foreground', light: 'oklch(1.0000 0 0)', dark: 'oklch(1.0000 0 0)' },
    ],
  },
  {
    label: 'Surface',
    tokens: [
      { name: 'card', cssVar: '--card', light: 'oklch(0.9686 0.0091 78.2818)', dark: 'oklch(0.2685 0.0063 34.2976)' },
      { name: 'card-foreground', cssVar: '--card-foreground', light: 'oklch(0.3660 0.0251 49.6085)', dark: 'oklch(0.9699 0.0013 106.4238)' },
      { name: 'popover', cssVar: '--popover', light: 'oklch(0.9686 0.0091 78.2818)', dark: 'oklch(0.2685 0.0063 34.2976)' },
      { name: 'popover-foreground', cssVar: '--popover-foreground', light: 'oklch(0.3660 0.0251 49.6085)', dark: 'oklch(0.9699 0.0013 106.4238)' },
    ],
  },
  {
    label: 'Utility',
    tokens: [
      { name: 'border', cssVar: '--border', light: 'oklch(0.8866 0.0404 89.6994)', dark: 'oklch(0.3741 0.0087 67.5582)' },
      { name: 'input', cssVar: '--input', light: 'oklch(0.8866 0.0404 89.6994)', dark: 'oklch(0.3741 0.0087 67.5582)' },
      { name: 'ring', cssVar: '--ring', light: 'oklch(0.5553 0.1455 48.9975)', dark: 'oklch(0.7049 0.1867 47.6044)' },
    ],
  },
  {
    label: 'Charts',
    tokens: [
      { name: 'chart-1', cssVar: '--chart-1', light: 'oklch(0.5553 0.1455 48.9975)', dark: 'oklch(0.7049 0.1867 47.6044)' },
      { name: 'chart-2', cssVar: '--chart-2', light: 'oklch(0.5534 0.0116 58.0708)', dark: 'oklch(0.6847 0.1479 237.3225)' },
      { name: 'chart-3', cssVar: '--chart-3', light: 'oklch(0.5538 0.1207 66.4416)', dark: 'oklch(0.7952 0.1617 86.0468)' },
      { name: 'chart-4', cssVar: '--chart-4', light: 'oklch(0.5534 0.0116 58.0708)', dark: 'oklch(0.7161 0.0091 56.2590)' },
      { name: 'chart-5', cssVar: '--chart-5', light: 'oklch(0.6806 0.1423 75.8340)', dark: 'oklch(0.5534 0.0116 58.0708)' },
    ],
  },
  {
    label: 'Sidebar',
    tokens: [
      { name: 'sidebar', cssVar: '--sidebar', light: 'oklch(0.9363 0.0218 83.2637)', dark: 'oklch(0.2685 0.0063 34.2976)' },
      { name: 'sidebar-foreground', cssVar: '--sidebar-foreground', light: 'oklch(0.3660 0.0251 49.6085)', dark: 'oklch(0.9699 0.0013 106.4238)' },
      { name: 'sidebar-primary', cssVar: '--sidebar-primary', light: 'oklch(0.5553 0.1455 48.9975)', dark: 'oklch(0.7049 0.1867 47.6044)' },
      { name: 'sidebar-primary-foreground', cssVar: '--sidebar-primary-foreground', light: 'oklch(1.0000 0 0)', dark: 'oklch(1.0000 0 0)' },
      { name: 'sidebar-accent', cssVar: '--sidebar-accent', light: 'oklch(0.5538 0.1207 66.4416)', dark: 'oklch(0.6847 0.1479 237.3225)' },
      { name: 'sidebar-accent-foreground', cssVar: '--sidebar-accent-foreground', light: 'oklch(1.0000 0 0)', dark: 'oklch(0.2839 0.0734 254.5378)' },
      { name: 'sidebar-border', cssVar: '--sidebar-border', light: 'oklch(0.8866 0.0404 89.6994)', dark: 'oklch(0.3741 0.0087 67.5582)' },
      { name: 'sidebar-ring', cssVar: '--sidebar-ring', light: 'oklch(0.5553 0.1455 48.9975)', dark: 'oklch(0.7049 0.1867 47.6044)' },
    ],
  },
];

const SHADOWS = [
  { name: '2xs', class: 'shadow-2xs' },
  { name: 'xs', class: 'shadow-xs' },
  { name: 'sm', class: 'shadow-sm' },
  { name: 'default', class: 'shadow' },
  { name: 'md', class: 'shadow-md' },
  { name: 'lg', class: 'shadow-lg' },
  { name: 'xl', class: 'shadow-xl' },
  { name: '2xl', class: 'shadow-2xl' },
];

const RADII = [
  { name: 'sm', class: 'rounded-sm', value: 'calc(0.3rem - 4px)' },
  { name: 'md', class: 'rounded-md', value: 'calc(0.3rem - 2px)' },
  { name: 'lg', class: 'rounded-lg', value: '0.3rem' },
  { name: 'xl', class: 'rounded-xl', value: 'calc(0.3rem + 4px)' },
];

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 10, 12, 16];

const SECTIONS = [
  { id: 'colors', label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'radius', label: 'Border Radius' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'animations', label: 'Animations' },
  { id: 'components', label: 'Components' },
];

/* ------------------------------------------------------------------ */
/*  Swatch component                                                   */
/* ------------------------------------------------------------------ */

function ColorSwatch({ token, mode }: { token: ColorToken; mode: 'light' | 'dark' }) {
  const oklch = mode === 'light' ? token.light : token.dark;
  const hex = oklchToHex(oklch);

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-12 w-12 shrink-0 rounded-md border border-gray-300"
        style={{ backgroundColor: hex }}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{token.name}</p>
        <p className="font-mono text-xs text-black">{hex}</p>
        <p className="font-mono text-[10px] text-gray-500 truncate">
          var({token.cssVar})
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold tracking-tight scroll-mt-20">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Design System</h1>
        <p className="mt-2 text-lg text-gray-500">
          Reps / LiftLog &mdash; Token reference &amp; component library
        </p>

        {/* Table of contents */}
        <nav className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-gray-100"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="space-y-20">
        {/* ============================================================ */}
        {/*  COLORS                                                       */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="colors">Colors</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Two-tier token system. Primitive oklch values mapped to semantic roles via Tailwind&apos;s @theme inline.
          </p>

          {COLOR_GROUPS.map((group) => (
            <div key={group.label} className="mb-10">
              <h3 className="mb-4 text-lg font-semibold text-black/80">
                {group.label}
              </h3>
              <div className="grid grid-cols-1 gap-x-12 gap-y-1 lg:grid-cols-2">
                {/* Light column header */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500 lg:col-span-1">
                  Light
                </p>
                <p className="mb-2 hidden text-xs font-semibold uppercase tracking-widest text-gray-500 lg:block">
                  Dark
                </p>

                {group.tokens.map((token) => (
                  <div
                    key={token.name}
                    className="col-span-1 grid grid-cols-1 gap-x-12 gap-y-3 py-2 lg:col-span-2 lg:grid-cols-2"
                  >
                    <ColorSwatch token={token} mode="light" />
                    <ColorSwatch token={token} mode="dark" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ============================================================ */}
        {/*  TYPOGRAPHY                                                   */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="typography">Typography</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Three font families registered via CSS custom properties.
          </p>

          <div className="space-y-10">
            {/* Oxanium */}
            <div>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="text-lg font-semibold">Oxanium</h3>
                <span className="font-mono text-xs text-gray-500">
                  var(--font-sans) &middot; sans-serif
                </span>
              </div>
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-6" style={{ fontFamily: 'Oxanium, sans-serif' }}>
                <p className="text-4xl font-bold">Heading 1 &mdash; The quick brown fox</p>
                <p className="text-3xl font-bold">Heading 2 &mdash; jumps over the lazy dog</p>
                <p className="text-2xl font-semibold">Heading 3 &mdash; Pack my box with five dozen</p>
                <p className="text-xl font-medium">Heading 4 &mdash; liquor jugs</p>
                <p className="mt-4 text-base">Body &mdash; AaBbCcDdEeFfGg 0123456789</p>
                <p className="text-sm text-gray-500">Small &mdash; Secondary text at smaller size</p>
              </div>
            </div>

            {/* Merriweather */}
            <div>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="text-lg font-semibold">Merriweather</h3>
                <span className="font-mono text-xs text-gray-500">
                  var(--font-serif) &middot; serif
                </span>
              </div>
              <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-6" style={{ fontFamily: 'Merriweather, serif' }}>
                <p className="text-2xl font-bold">The quick brown fox jumps over the lazy dog</p>
                <p className="text-base leading-relaxed">
                  Designed for long-form reading. This serif typeface provides a warm,
                  traditional feel that complements the geometric modernity of Oxanium.
                  AaBbCcDdEeFfGg 0123456789 !@#$%
                </p>
                <p className="text-sm italic text-gray-500">
                  Italic variant for emphasis and secondary content.
                </p>
              </div>
            </div>

            {/* Fira Code */}
            <div>
              <div className="mb-3 flex items-baseline gap-3">
                <h3 className="text-lg font-semibold">Fira Code</h3>
                <span className="font-mono text-xs text-gray-500">
                  var(--font-mono) &middot; monospace
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6" style={{ fontFamily: '"Fira Code", monospace' }}>
                <pre className="text-sm leading-relaxed">
{`const theme = {
  primary: "oklch(0.5553 0.1455 48.9975)",
  radius:  "0.3rem",
  spacing: "0.25rem",
};

// Ligatures: => !== === >= <=`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SHADOWS                                                      */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="shadows">Shadows</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            8-level shadow scale using warm-tinted shadow color in light mode, neutral in dark mode.
          </p>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {SHADOWS.map((s) => (
              <div
                key={s.name}
                className={`rounded-lg border border-gray-200 bg-gray-50 p-6 ${s.class}`}
              >
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="mt-1 font-mono text-[10px] text-gray-500">{s.class}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/*  BORDER RADIUS                                                */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="radius">Border Radius</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Derived from --radius: 0.3rem base value.
          </p>

          <div className="flex flex-wrap gap-6">
            {RADII.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-2">
                <div
                  className={`h-20 w-20 border-2 border-gray-400 bg-gray-100 ${r.class}`}
                />
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="font-mono text-[10px] text-gray-500">{r.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/*  SPACING                                                      */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="spacing">Spacing</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Based on --spacing: 0.25rem (4px) baseline unit.
          </p>

          <div className="space-y-3">
            {SPACING_STEPS.map((step) => (
              <div key={step} className="flex items-center gap-4">
                <span className="w-8 text-right font-mono text-sm text-gray-500">
                  {step}
                </span>
                <div
                  className="h-6 rounded-sm bg-gray-700"
                  style={{ width: `${step * 0.25}rem` }}
                />
                <span className="font-mono text-xs text-gray-500">
                  {step * 0.25}rem / {step * 4}px
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/*  ANIMATIONS                                                   */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="animations">Animations</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Custom keyframe animations defined in globals.css.
          </p>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <AnimationDemo className="animate-fade-in" label="fade-in" />
            <AnimationDemo className="animate-slide-up" label="slide-up" />
            <AnimationDemo className="animate-pr-toast" label="pr-toast" />
            <AnimationDemo className="animate-tour-highlight" label="tour-highlight" />
          </div>
        </section>

        {/* ============================================================ */}
        {/*  COMPONENTS                                                   */}
        {/* ============================================================ */}
        <section>
          <SectionHeading id="components">Components</SectionHeading>
          <p className="mt-2 mb-8 text-sm text-gray-500">
            Live renders of the app&apos;s component library using actual imports.
          </p>

          {/* Buttons */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Button</h3>
            <div className="space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
              {/* Variants */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Variants
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
              </div>

              {/* Sizes */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Sizes
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                </div>
              </div>

              {/* States */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
                  States
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button disabled>Disabled</Button>
                  <Button loading>Loading</Button>
                  <Button fullWidth>Full Width</Button>
                </div>
              </div>
            </div>
          </div>

          {/* Card */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Card</h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <p className="text-sm font-semibold">Default Card</p>
                <p className="mt-1 text-xs text-gray-500">
                  With default padding. Uses bg-gray-50, rounded-lg, border, shadow-sm.
                </p>
              </Card>
              <Card noPadding>
                <div className="p-4">
                  <p className="text-sm font-semibold">No Padding Card</p>
                  <p className="mt-1 text-xs text-gray-500">
                    noPadding prop removes default p-4. Content manages its own spacing.
                  </p>
                </div>
              </Card>
            </div>
          </div>

          {/* Input */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Input</h3>
            <div className="grid grid-cols-1 gap-6 rounded-lg border border-gray-200 bg-gray-50 p-6 lg:grid-cols-3">
              <Input placeholder="Default input" />
              <Input label="With Label" placeholder="Enter value..." />
              <Input label="With Error" placeholder="Invalid..." error="This field is required" />
            </div>
          </div>

          {/* Textarea */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Textarea</h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <Label className="mb-1.5 block">Notes</Label>
              <Textarea placeholder="Write your workout notes here..." />
            </div>
          </div>

          {/* Select */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Select</h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <Label className="mb-1.5 block">Unit Preference</Label>
              <Select defaultValue="lbs" className="max-w-xs">
                <option value="lbs">Pounds (lbs)</option>
                <option value="kg">Kilograms (kg)</option>
              </Select>
            </div>
          </div>

          {/* Label */}
          <div className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-black/80">Label</h3>
            <div className="flex gap-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
              <Label>Default Label</Label>
              <Label className="text-gray-500">Muted Label</Label>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-200 pt-6 pb-12 text-center text-xs text-gray-500">
        Reps / LiftLog Design System &mdash; Auto-generated from globals.css tokens
      </footer>
    </div>
  );
}
