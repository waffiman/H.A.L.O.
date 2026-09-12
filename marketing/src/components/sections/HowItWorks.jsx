import SectionHeading from '../SectionHeading';
import ShimmerHeading from '../ShimmerHeading';
import LearnMore from '../LearnMore';
import AlertsCard from '../cards/AlertsCard';
import ChartCard from '../cards/ChartCard';
import SignUpCard from '../cards/SignUpCard';

// Figma Homepage > How it Works (1:28229 / rows in 1:28252).
const ROWS = [
  {
    title: 'Stay Updated with Real-Time Alerts',
    body: 'Get instant notifications on every crypto movement, price change, or transaction.',
    Visual: AlertsCard,
  },
  {
    title: 'Smarter Charts for Smarter Investing',
    body: 'Interactive analytics display real-time values, empowering you to analyze trends and maximize your returns.',
    Visual: ChartCard,
    flip: true,
  },
  {
    title: 'Fast Sign-In Faster Experience',
    body: 'Skip the long forms. Enjoy a one-minute login designed for speed, simplicity, and security.',
    Visual: SignUpCard,
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20">
      <div className="mx-auto w-full max-w-shell px-6">
        <SectionHeading badge="Crypto Infrastructure" title="The Technology Every Crypto Movement">
          Blockchain connects users worldwide, enabling instant, borderless, and trusted digital
          payments. Each crypto transaction is recorded.
        </SectionHeading>

        <div className="mt-16 overflow-hidden rounded-[32px] border border-solid border-stroke [background-image:linear-gradient(234deg,#171717_4.55%,#121212_82.77%)]">
          <div className="flex flex-col gap-20 px-6 py-10 lg:gap-[85px] lg:px-[50px] lg:py-[29px]">
            {ROWS.map(({ title, body, Visual, flip }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-10 lg:flex-row lg:gap-[100px]"
              >
                <div
                  className={`flex w-full flex-col items-start gap-8 lg:w-[438px] lg:gap-12 ${
                    flip ? 'lg:order-2' : ''
                  }`}
                >
                  <div className="flex flex-col gap-6">
                    <ShimmerHeading>{title}</ShimmerHeading>
                    <p className="text-body-16 text-n2">{body}</p>
                  </div>
                  <LearnMore />
                </div>
                <div className={`w-full lg:w-[620px] ${flip ? 'lg:order-1' : ''}`}>
                  <Visual />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
