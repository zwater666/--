declare module '@vitejs/plugin-react' {
  import { Plugin } from 'vite'
  const react: (options?: any) => Plugin[]
  export default react
}
