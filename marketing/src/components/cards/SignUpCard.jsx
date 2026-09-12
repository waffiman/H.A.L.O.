import InfoBlock from './InfoBlock';
import envelope from '../../assets/icon-envelope.svg';
import eyeSlash from '../../assets/icon-eye-slash.svg';
import user from '../../assets/icon-user.svg';
import check from '../../assets/icon-check.svg';
import glow from '../../assets/hiw-s-glow.svg';

// Figma 1:28496 — the one-minute sign-up panel.
export default function SignUpCard() {
  return (
    <InfoBlock>
      <img
        src={glow}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 -top-8 w-[184px] max-w-none mix-blend-plus-lighter"
      />
      <div className="relative flex w-[80%] max-w-[355px] flex-col gap-12 overflow-hidden rounded-[17px] border border-solid border-[rgba(30,28,26,0.04)] bg-gradient-to-b from-[#151515] to-[rgba(18,18,18,0)] px-6 py-11">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-[11px]">
            <p className="text-xl font-medium text-[#6e7072]">Email</p>
            <div className="relative h-14 overflow-hidden rounded-[10px] border border-solid border-[#171717] bg-[#131313]">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-base font-medium text-[#373737]">
                sahabad@gmail.com
              </span>
              <img src={envelope} alt="" aria-hidden="true" className="absolute right-4 top-1/2 size-5 -translate-y-1/2" />
            </div>
          </div>
          <div className="flex flex-col gap-[11px]">
            <p className="text-xl font-medium text-[#6e7072]">Password</p>
            <div className="relative h-14 overflow-hidden rounded-[10px] border border-solid border-[#171717] bg-[#131313]">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-medium tracking-[4px] text-[#373737]">
                *****
              </span>
              <img src={eyeSlash} alt="" aria-hidden="true" className="absolute right-4 top-1/2 size-5 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-[235px] flex-col items-center gap-4">
          <span className="flex h-14 items-center justify-center gap-2 rounded-[10px] border border-solid border-[#171717] bg-[#131313] px-5">
            <span className="text-xl font-semibold text-white">Sign up</span>
            <img src={user} alt="" aria-hidden="true" className="size-5" />
          </span>
          <span className="flex items-center justify-center gap-2">
            <img src={check} alt="" aria-hidden="true" className="size-4" />
            <span className="text-base text-[#373737]">I agree with terms of service.</span>
          </span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0f0f0f] to-transparent" />
    </InfoBlock>
  );
}
