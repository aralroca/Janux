import { jsx } from 'janux';

export const meta = {
  title: '</title><script>alert(1)</script>',
};

export default function Evil() {
  return jsx('main', { children: 'safe' });
}
