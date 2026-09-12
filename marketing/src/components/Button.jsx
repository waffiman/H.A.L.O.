import { Link } from 'react-router-dom';
import arrow16 from '../assets/arrow-right-16.svg';
import arrow20 from '../assets/arrow-right-20.svg';

// Figma "button 1" (1:165135) — gradient fill, dark label.
// Figma "button 2" (1:165129) — dark gradient, light label.
const VARIANTS = {
  primary:
    'border-[#0d0c0c] text-n4 [background-image:linear-gradient(-89.67deg,rgb(255,139,115)_3.06%,rgb(74,249,249)_40.16%)]',
  secondary:
    'border-[#575757] text-white bg-gradient-to-b from-[#525252] to-[#232323]',
};

const SIZES = {
  md: 'h-[48px] px-4 text-body-16',
  lg: 'h-[56px] px-7 text-body-16',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  to,
  href,
  icon = true,
  className = '',
  ...rest
}) {
  const cls = [
    'inline-flex items-center justify-center gap-2.5 rounded-pill border border-solid',
    'font-medium whitespace-nowrap overflow-hidden transition-transform duration-200',
    'hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    VARIANTS[variant],
    SIZES[size],
    className,
  ].join(' ');

  const arrow = variant === 'primary' ? arrow20 : arrow16;
  const inner = (
    <>
      {children}
      {icon && (
        <img
          src={arrow}
          alt=""
          aria-hidden="true"
          className={variant === 'primary' ? 'size-5' : 'size-4'}
        />
      )}
    </>
  );

  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}
