from pathlib import Path

index_path = Path('src/routes/index.tsx')
root_path = Path('src/routes/__root.tsx')

index = index_path.read_text()
root = root_path.read_text()

old_import = 'import { createFileRoute } from "@tanstack/react-router";'
new_import = 'import { createFileRoute, redirect } from "@tanstack/react-router";'
if old_import not in index:
    raise SystemExit('index router import not found')
index = index.replace(old_import, new_import, 1)

old_route = ''' export const Route = createFileRoute("/")({
   validateSearch: (search: Record<string, unknown>) => {
     return {
       compare: z.string().optional().catch(undefined).parse(search.compare),
     };
   },
   component: Dashboard,
 });'''
new_route = ''' export const Route = createFileRoute("/")({
   validateSearch: (search: Record<string, unknown>) => {
     return {
       compare: z.string().optional().catch(undefined).parse(search.compare),
     };
   },
   beforeLoad: ({ search }) => {
     // Keep the internal theme comparison screen available, but make /home
     // the single canonical dashboard for every normal app entry.
     if (search.compare !== "theme") {
       throw redirect({ to: "/home", replace: true });
     }
   },
   component: Dashboard,
 });'''
if old_route not in index:
    raise SystemExit('index route block not found')
index = index.replace(old_route, new_route, 1)

old_auth_redirect = "router.navigate({ to: '/' });"
new_auth_redirect = "router.navigate({ to: '/home', replace: true });"
if old_auth_redirect not in root:
    raise SystemExit('auth redirect not found')
root = root.replace(old_auth_redirect, new_auth_redirect, 1)

index_path.write_text(index)
root_path.write_text(root)
