import ProgressBar from '@badrap/bar-of-progress';

const progressBar = new ProgressBar({
  size: 4,
  // kessoku moe Hot Pink accent (#FF4D8D ≈ oklch(0.68 0.21 358)); hex for the progress lib.
  color: '#FF4D8D',
  className: 'z-[60]',
  delay: 100,
});

export default progressBar;
