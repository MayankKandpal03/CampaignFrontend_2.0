import useAuthStore from "../stores/useAuthStore"

export default function PMDashboard(){

    const {logout} = useAuthStore(state =>  state.logout)

    const handleLogout = ()=>{
        logout()
    }

    return(
        <div>Hello pm
            <form action="" onSubmit={handleLogout}>
                <button>Submit</button>
            </form>
        </div>
    )
}