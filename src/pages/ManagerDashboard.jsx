import useAuthStore from "../stores/useAuthStore"
export default function ManagerDashboard(){
    const logout = useAuthStore(state =>  state.logout)

    const handleLogout = (e)=>{
        e.preventDefault()
        logout()
    }

    return(
        <div>Hello manager
             <form  onSubmit={handleLogout}>
                <button type="submit">Submit</button>
            </form>
        </div>
    )
}



















