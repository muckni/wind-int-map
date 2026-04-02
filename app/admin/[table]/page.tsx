import AdminTableEditor from "../../../components/admin/AdminTableEditor";

export default async function AdminTablePage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = await params;
  return <AdminTableEditor table={table} />;
}
