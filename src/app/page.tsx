import type { CSSProperties } from 'react';
import Image from 'next/image';
import { Space_Grotesk, Work_Sans } from 'next/font/google';
import styles from './page.module.css';

const headingFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-heading',
});

const bodyFont = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const caseStudySummary = [
  {
    title: 'Challenge',
    body: 'Busy professionals wanted structure, but most workout apps felt noisy and hard to trust after the first week.',
  },
  {
    title: 'Solution',
    body: 'I designed a guided flow focused on quick starts, clear set logging, and simple progress feedback users can act on.',
  },
  {
    title: 'Results',
    body: 'Early usability sessions showed faster first-workout completion and stronger confidence in sticking to a weekly routine.',
  },
];

const galleryItems = [
  {
    src: '/onboarding/quick-start.svg',
    alt: 'Quick Start home screen for the fitness app',
    label: 'Quick Start',
  },
  {
    src: '/onboarding/workout.svg',
    alt: 'Workout logging screen for the fitness app',
    label: 'Workout Builder',
  },
  {
    src: '/onboarding/trainer.svg',
    alt: 'AI trainer chat screen for the fitness app',
    label: 'Coach Support',
  },
];

const revealDelay = (delay: string): CSSProperties => ({
  animationDelay: delay,
});

export default function Home() {
  return (
    <main className={`${styles.page} ${headingFont.variable} ${bodyFont.variable}`}>
      <div className={styles.backdrop} aria-hidden="true" />

      <header className={styles.header}>
        <p className={styles.brand}>Perry Sweitzer Portfolio</p>
        <nav aria-label="Section links" className={styles.nav}>
          <a href="#case-study">Case Study</a>
          <a href="#details">Details</a>
          <a href="#screens">Screens</a>
        </nav>
      </header>

      <section className={`${styles.hero} ${styles.reveal}`} style={revealDelay('0.08s')}>
        <p className={styles.kicker}>UX Case Study 01</p>
        <h1>Fitness App Product Experience</h1>
        <p className={styles.heroBody}>
          A focused case study on helping people go from planning workouts to finishing them with less
          friction and better habit consistency.
        </p>
      </section>

      <section id="case-study" className={`${styles.summarySection} ${styles.reveal}`} style={revealDelay('0.18s')}>
        <div className={styles.projectLabel}>
          <span className={styles.projectDot} aria-hidden="true" />
          <div>
            <p className={styles.projectName}>Fitness App</p>
            <p className={styles.projectMeta}>Role: UX Design and Product Strategy</p>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          {caseStudySummary.map((item) => (
            <article key={item.title} className={styles.summaryCard}>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.featureSection} ${styles.reveal}`} style={revealDelay('0.28s')}>
        <div className={styles.featureBand} aria-hidden="true" />
        <figure className={styles.browserFrame}>
          <div className={styles.browserTopBar}>
            <div className={styles.browserButtons}>
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className={styles.browserBody}>
            <Image
              src="/onboarding/workout.svg"
              alt="Feature screenshot from the fitness app case study"
              width={192}
              height={320}
              className={styles.featureImage}
              priority
            />
          </div>
        </figure>
      </section>

      <section id="details" className={`${styles.storySection} ${styles.reveal}`} style={revealDelay('0.38s')}>
        <article className={styles.storyCopy}>
          <p>
            <strong>A clearer path from intention to action.</strong> This concept fitness app was designed
            around one core objective: help people begin and complete workouts quickly without feeling lost.
            The experience combines lightweight onboarding, reusable templates, and in-workout guidance so
            users spend less time configuring and more time training. By prioritizing information hierarchy,
            progressive disclosure, and simple feedback loops, the flow supports new and returning users
            equally well while keeping the interface calm and fast.
          </p>
        </article>

        <aside className={styles.storyAside}>
          <a href="https://repsfit.app" target="_blank" rel="noreferrer" className={styles.productLink}>
            Demo the app
          </a>
        </aside>
      </section>

      <section id="screens" className={`${styles.gallerySection} ${styles.reveal}`} style={revealDelay('0.48s')}>
        <h2>Additional Screens</h2>
        <div className={styles.galleryGrid}>
          {galleryItems.map((item) => (
            <figure key={item.label} className={styles.galleryCard}>
              <div className={styles.galleryImageWrap}>
                <Image src={item.src} alt={item.alt} width={192} height={320} className={styles.galleryImage} />
              </div>
              <figcaption>{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
