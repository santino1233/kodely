export default function Home(){
  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#08070B",color:"#F5F2F7",fontFamily:"system-ui,-apple-system,Segoe UI,Roboto,sans-serif",textAlign:"center",padding:"24px"}}>
      <div>
        <p style={{fontFamily:"ui-monospace,monospace",fontSize:12,letterSpacing:".16em",textTransform:"uppercase",color:"#a79fb0"}}>AI websites, simplified</p>
        <h1 style={{fontSize:"clamp(2.6rem,8vw,5.5rem)",fontWeight:800,letterSpacing:"-.045em",margin:"18px 0 0"}}>
          <span style={{background:"linear-gradient(100deg,#F72570,#FF6B67,#FF9868,#A33DFF)",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>kodely</span>
        </h1>
        <p style={{color:"#a79fb0",marginTop:16,fontSize:18}}>The app is live. Building begins here.</p>
        <p style={{fontFamily:"ui-monospace,monospace",fontSize:12,color:"#5f5869",marginTop:28}}>Next.js · kodely-app · :3000</p>
      </div>
    </main>
  );
}
