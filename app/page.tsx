import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#08070B",color:"#F5F2F7",fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif",textAlign:"center",padding:"24px"}}>
      <div>
        <p style={{fontFamily:"ui-monospace,monospace",fontSize:12,letterSpacing:".16em",textTransform:"uppercase",color:"#a79fb0"}}>AI websites, simplified</p>
        <h1 style={{fontSize:"clamp(2.6rem,8vw,5.5rem)",fontWeight:800,letterSpacing:"-.045em",margin:"18px 0 0"}}>
          <span style={{background:"linear-gradient(100deg,#F72570,#FF6B67,#FF9868,#A33DFF)",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>kodely</span>
        </h1>
        <p style={{color:"#a79fb0",marginTop:16,fontSize:18}}>Describe it. Generate it. Ship it.</p>
        <div style={{marginTop:32,display:"flex",gap:12,justifyContent:"center"}}>
          <Link href="/signup" style={{background:"#F5F2F7",color:"#08070B",padding:"10px 20px",borderRadius:10,fontWeight:600,fontSize:14,textDecoration:"none"}}>
            Start building
          </Link>
          <Link href="/login" style={{border:"1px solid #3a3542",color:"#F5F2F7",padding:"10px 20px",borderRadius:10,fontWeight:600,fontSize:14,textDecoration:"none"}}>
            Sign in
          </Link>
        </div>
        <p style={{fontFamily:"ui-monospace,monospace",fontSize:12,color:"#5f5869",marginTop:32}}>Next.js · kodely-app · :3000</p>
      </div>
    </main>
  );
}
