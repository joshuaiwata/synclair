
/** Registry-exempt (infra): the preview DATA map for vendored shadcn primitives — consumed by cards and doc pages, never composed into product UI. */
import { Inbox } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { live, type Preview } from "@/lib/system/doc-types"

/**
 * Gallery previews for NATIVE shadcn primitives — natives have no colocated
 * `.docs.tsx` (their docs live upstream at ui.shadcn.com), so the library
 * renders these instead of "No preview". Every primitive in `components/ui/`
 * gets one (enforced by `check:previews`): statically renderable ones render
 * their real composition; portal-driven ones (dialog, sheet, dropdown-menu,
 * select, tooltip) render their REAL closed trigger — honest on the card
 * (pointer-events-none thumbnail) and fully interactive on the doc page.
 */
const PREVIEWS: Record<string, Preview> = {
  accordion: live(
    <Accordion type="single" collapsible defaultValue="a" className="w-56">
      <AccordionItem value="a">
        <AccordionTrigger>Is it accessible?</AccordionTrigger>
        <AccordionContent>Yes — WAI-ARIA compliant.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  alert: live(
    <Alert className="max-w-60">
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Inline message with a title.</AlertDescription>
    </Alert>
  ),
  badge: live(
    <div className="flex gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
  breadcrumb: live(
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Library</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Components</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Breadcrumb</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
  button: live(
    <div className="flex items-center gap-2">
      <Button size="sm">Primary</Button>
      <Button size="sm" variant="secondary">
        Secondary
      </Button>
      <Button size="sm" variant="outline">
        Outline
      </Button>
    </div>
  ),
  card: live(
    <Card className="w-56">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Header, content, footer slots.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">Content area</CardContent>
    </Card>
  ),
  command: live(
    <Command className="w-64 rounded-lg border shadow-none">
      <CommandInput placeholder="Search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem>
            Components <CommandShortcut>⌘C</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Knowledge <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
  dialog: live(
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Open dialog
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm change</DialogTitle>
          <DialogDescription>
            A modal window layered over the page, with header, body, and footer slots.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button size="sm">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  "dropdown-menu": live(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          Open menu
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>
          Edit <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  empty: live(
    <Empty className="w-64 border border-dashed p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>No items yet</EmptyTitle>
        <EmptyDescription>The zero-state slot: icon, title, description.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ),
  input: live(<Input placeholder="Email address" className="w-48" />),
  "input-group": live(
    <InputGroup className="w-52">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
    </InputGroup>
  ),
  "scroll-area": live(
    <ScrollArea className="h-28 w-48 rounded-md border p-3">
      <div className="flex flex-col gap-2 text-xs">
        {["accordion", "alert", "badge", "breadcrumb", "button", "card", "command", "dialog"].map(
          (name) => (
            <span key={name} className="font-mono">
              {name}
            </span>
          )
        )}
      </div>
    </ScrollArea>
  ),
  select: live(
    <Select>
      <SelectTrigger className="w-44">
        <SelectValue placeholder="Select a status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="won">Won</SelectItem>
        <SelectItem value="lost">Lost</SelectItem>
      </SelectContent>
    </Select>
  ),
  separator: live(
    <div className="flex w-40 flex-col gap-2">
      <span className="text-xs">Above</span>
      <Separator />
      <span className="text-xs">Below</span>
    </div>
  ),
  sheet: live(
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          Open sheet
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Panel title</SheetTitle>
          <SheetDescription>
            A side panel that slides in from an edge — header, body, and footer slots.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  sidebar: live(
    <SidebarProvider className="min-h-0 w-auto">
      <Sidebar collapsible="none" className="h-52 w-52 overflow-hidden rounded-lg border">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Library</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Components</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Blocks</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Templates</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  ),
  skeleton: live(
    <div className="flex w-44 flex-col gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
  table: live(
    <Table className="w-52">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Quote A</TableCell>
          <TableCell>Open</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Quote B</TableCell>
          <TableCell>Won</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
  tabs: live(
    <Tabs defaultValue="overview" className="w-52">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
  textarea: live(<Textarea placeholder="Leave a note…" className="w-48" />),
  tooltip: live(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="outline">
            Hover me
          </Button>
        </TooltipTrigger>
        <TooltipContent>Contextual hint on hover</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
}

export function getNativePreview(name: string): Preview | undefined {
  return PREVIEWS[name]
}
