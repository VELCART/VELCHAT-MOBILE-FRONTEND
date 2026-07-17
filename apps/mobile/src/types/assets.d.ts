/**
 * Static image/asset module typings so `import x from './foo.png'` type-checks.
 * Metro bundles the asset; the import resolves to an RN image source ref.
 */
declare module '*.png' {
  import type { ImageRequireSource } from 'react-native';
  const content: ImageRequireSource;
  export default content;
}
declare module '*.jpg' {
  import type { ImageRequireSource } from 'react-native';
  const content: ImageRequireSource;
  export default content;
}
declare module '*.jpeg' {
  import type { ImageRequireSource } from 'react-native';
  const content: ImageRequireSource;
  export default content;
}
declare module '*.webp' {
  import type { ImageRequireSource } from 'react-native';
  const content: ImageRequireSource;
  export default content;
}
declare module '*.gif' {
  import type { ImageRequireSource } from 'react-native';
  const content: ImageRequireSource;
  export default content;
}
